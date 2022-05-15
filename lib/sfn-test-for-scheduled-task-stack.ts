import {
  Stack,
  StackProps,
  aws_autoscaling as autoscaling,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_events as events,
  aws_events_targets as targets,
  Duration
} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {IntegrationPattern} from "aws-cdk-lib/aws-stepfunctions";

interface SfnTestForScheduledTaskStackProps extends StackProps {
  appClusterInstanceSSHAllowedIP: string;
  appClusterInstanceSSHKeyName: string;
}

export class SfnTestForScheduledTaskStack extends Stack {
  constructor(scope: Construct, id: string, props: SfnTestForScheduledTaskStackProps) {
    super(scope, id, props);

    // Network
    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'ecs',
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    });

    // ECS Cluster
    const appCluster = new ecs.Cluster(this, 'AppCluster', {
      vpc: vpc,
      clusterName: 'sfn-test-for-scheduled-task-cluster'
    });

    // ECS Cluster Instances
    const appClusterInstanceSG = new ec2.SecurityGroup(this, 'AppClusterInstanceSG', { vpc: vpc });
    appClusterInstanceSG.addIngressRule(ec2.Peer.ipv4(props.appClusterInstanceSSHAllowedIP), ec2.Port.tcp(22), 'SSH');
    const appClusterInstanceRole = new iam.Role(this, 'AppClusterInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonEC2ContainerServiceforEC2Role'
        ),
      ]
    });
    const appClusterInstanceASG = new autoscaling.AutoScalingGroup(this, 'AppClusterInstanceASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.lookup({
        name: 'amzn2-ami-ecs-hvm-2.0.20220509-x86_64-ebs'
      }),
      securityGroup: appClusterInstanceSG,
      userData: (() => {
        const commandsUserData = ec2.UserData.forLinux();
        commandsUserData.addCommands(`echo "ECS_CLUSTER=${appCluster.clusterName}" >> /etc/ecs/ecs.config`);

        return commandsUserData;
      })(),
      keyName: props.appClusterInstanceSSHKeyName,
      role: appClusterInstanceRole,
      maxCapacity: 2,
      minCapacity: 1,
      desiredCapacity: 1,
      newInstancesProtectedFromScaleIn: true
    });
    const appClusterCapacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: appClusterInstanceASG,
    });
    appCluster.addAsgCapacityProvider(appClusterCapacityProvider);

    // Hello World App
    const helloWorldAppTD = new ecs.Ec2TaskDefinition(this, 'HelloWorldAppTD', {
      family: 'hello-world'
    });
    helloWorldAppTD.addContainer('App', {
      image: ecs.ContainerImage.fromRegistry('alpine'),
      memoryLimitMiB: 32,
      command: ['echo', 'Hello World!'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'sfn-test-for-scheduled-task/hello-world', logRetention: 3 }),
    });

    // Hello World execution state machine
    const helloWorldSM = new sfn.StateMachine(this, 'HelloWorldStateMachine', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      definition: (() => {
        const task = new tasks.EcsRunTask(this, 'RunHelloWorld', {
          cluster: appCluster,
          launchTarget: new tasks.EcsEc2LaunchTarget(),
          taskDefinition: helloWorldAppTD,
          integrationPattern: IntegrationPattern.RUN_JOB,
        });
        task.addRetry({
          errors: ['ECS.AmazonECSException'],
          maxAttempts: 5,
          interval: Duration.seconds(30)
        });

        return task;
      })(),
    });

    // Regularly Hello World app execution event rule
    new events.Rule(this, 'RegularlyExecuteHelloWorldStateMachine', {
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.SfnStateMachine(helloWorldSM)],
    });
  }
}
