const { SQSClient, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient();

const endpoints = [
  {
    url: '/users/{userId}/followers',
    metricName: 'followers'
  },
  {
    url: '/users/{userId}/cached-followers',
    metricName: 'cached-followers'
  },
  {
    url: '/users/{userId}',
    metricName: 'user'
  },
  {
    url: '/cached-users/{userId}',
    metricName: 'cached-user'
  }];

exports.handler = async (event) => {
  try {
    const { requestCount, userCount } = event.detail;
    const requests = buildRequests(requestCount, userCount);

    await queueRequests(requests);

  } catch (err) {
    console.error(err);
    return {
      message: 'Something went wrong starting the load test'
    }
  }
};

const buildRequests = (requestCount, userCount) => {
  const requests = [];
  for (let index = 0; index < (requestCount / endpoints.length); index++) {
    for (const endpoint of endpoints) {
      requests.push({
        method: 'GET',
        baseUrl: `${process.env.BASE_URL}${endpoint.url.replace('{userId}', Math.floor(Math.random() * userCount))}`,
        metricName: endpoint.metricName
      });
    }
  }

  return requests;
};

const createMessageBatchCommands = (requests) => {
  const commands = [];
  while (requests.length) {
    const batch = requests.splice(0, 10);
    commands.push(new SendMessageBatchCommand({
      Entries: batch.map((item, index) => {
        return {
          MessageBody: JSON.stringify(item),
          Id: `${index}`
        }
      }),
      QueueUrl: process.env.QUEUE_URL
    }));
  }

  return commands;
};

const queueRequests = async (requests) => {
  const commands = createMessageBatchCommands(requests);
  await Promise.all(commands.map(async (command) => {
    await sqs.send(command);
  }));
};