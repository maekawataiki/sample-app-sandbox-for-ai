variable "subdomain" {
  description = "Base subdomain the wildcard cert covers, e.g. prototype.example.com."
  type        = string
}

variable "zone_id" {
  description = "Route53 zone to place the DNS validation records in."
  type        = string
}
