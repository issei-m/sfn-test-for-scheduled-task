# sfn-test-for-scheduled-task

## Prerequisites

- Your key pair's public key has been registered your AWS account for EC2

## Operate CDK

```
npx cdk -c ssh_allowed_ip=<ip> -c ssh_key_name=<key_name> diff|synth|deploy 
```

- Replace `<ip>` with your global IPv4 address (ex: `123.123.123.123/32`)
- Replace `<key_name>` with the key name you registered with AWS account for EC2

## run-task

```
aws ecs run-task \
  --cluster sfn-test-for-scheduled-task-cluster \
  --launch-type EC2 \
  --task-definition hello-world:1
```
