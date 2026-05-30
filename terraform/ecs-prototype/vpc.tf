locals {
  azs           = ["${var.aws_region}a", "${var.aws_region}c", "${var.aws_region}d"]
  public_cidrs  = [cidrsubnet(var.vpc_cidr, 8, 0), cidrsubnet(var.vpc_cidr, 8, 1), cidrsubnet(var.vpc_cidr, 8, 2)]
  private_cidrs = [cidrsubnet(var.vpc_cidr, 6, 1), cidrsubnet(var.vpc_cidr, 6, 2), cidrsubnet(var.vpc_cidr, 6, 3)]
}

resource "aws_vpc" "prototype" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${local.name}-vpc"
  }
}

# Public subnets host the shared ALB. Tagged so the platform stack and the
# per-service deploy pipeline can discover them without hard-coded IDs.
resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.prototype.id
  cidr_block              = local.public_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name             = "${local.name}-public-${count.index + 1}"
    "prototype:tier" = "public"
  }
}

# Private subnets host the Fargate tasks (egress via NAT).
resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.prototype.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = {
    Name             = "${local.name}-private-${count.index + 1}"
    "prototype:tier" = "private"
  }
}

resource "aws_internet_gateway" "prototype" {
  vpc_id = aws_vpc.prototype.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name}-nat-eip" }
}

resource "aws_nat_gateway" "prototype" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${local.name}-nat" }
  depends_on    = [aws_internet_gateway.prototype]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.prototype.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.prototype.id
  }
  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.prototype.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.prototype.id
  }
  tags = { Name = "${local.name}-private-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# VPC Flow Logs — REJECT traffic only, the security-relevant signal at a fraction
# of the cost of logging ALL traffic. Switch traffic_type to "ALL" for full
# forensic capture.
resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/aws/vpc/${local.name}/flow-logs"
  retention_in_days = 30
}

resource "aws_iam_role" "vpc_flow" {
  name = "${local.name}-vpc-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "vpc_flow" {
  name = "vpc-flow-logs"
  role = aws_iam_role.vpc_flow.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
      ]
      Resource = "${aws_cloudwatch_log_group.vpc_flow.arn}:*"
    }]
  })
}

resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.prototype.id
  iam_role_arn         = aws_iam_role.vpc_flow.arn
  log_destination      = aws_cloudwatch_log_group.vpc_flow.arn
  log_destination_type = "cloud-watch-logs"
  traffic_type         = "REJECT"
}
