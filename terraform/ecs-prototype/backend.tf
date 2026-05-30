terraform {
  # Partial backend — bucket and dynamodb_table are passed at init time so this
  # sample can be deployed into any account without editing source. See README
  # "Step 1 — Create the Terraform backend" for the `-backend-config` flags.
  backend "s3" {
    key     = "ecs-prototype/terraform.tfstate"
    region  = "ap-northeast-1"
    encrypt = true
  }
}
