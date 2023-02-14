const { faker } = require('@faker-js/faker');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const eventbridge = new EventBridgeClient();
const ddb = new DynamoDBClient();
const colors = ['red', 'blue', 'green', 'yellow']

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    // See if we've already seeded enough data to run the demo. If not, only seed the additional data required.
    const seedCount = await getCurrentSeedUserCount();
    if (!seedCount || seedCount < body.userCount) {
      let ids = [...Array(body.userCount).keys()];
      ids = ids.slice(seedCount);
      console.log(ids);
      await Promise.allSettled(ids.map(async (id) => { 
        console.log(id);
        await generateNewUser(id, body.userCount);
      }));
      await setSeedUserCount(body.userCount);
    }

    await eventbridge.send(new PutEventsCommand({
      Entries: [
        {
          DetailType: 'Seed Completed',
          Detail: JSON.stringify({
            requestCount: body.requestCount,
            userCount: body.userCount
          }),
          Source: 'start-demo-function'
        }
      ]
    }));

    return { statusCode: 202 }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Something went wrong' })
    };
  }
};

const generateNewUser = async (id, totalUserCount) => {
  const user = {
    id: `${id}`,
    name: faker.helpers.fake('{{name.firstName}} {{name.lastName}}'),
    favoriteColor: colors[Math.floor(Math.random() * colors.length)],
    followers: buildFollowers(totalUserCount)
  };

  const response = await ddb.send(new PutItemCommand({
    TableName: process.env.TABLE_NAME,
    Item: marshall(user)
  }));

  console.log(response);
};

const buildFollowers = (totalUserCount) => {
  const numberOfFollowers = Math.floor(Math.random() * (totalUserCount / 4));
  const followers = [];
  for (let index = 0; index < numberOfFollowers; index++) {
    followers.push(Math.floor(Math.random() * totalUserCount));
  }

  return followers;
};

const getCurrentSeedUserCount = async () => {
  const response = await ddb.send(new GetItemCommand({
    TableName: process.env.TABLE_NAME,
    Key: marshall({ id: 'seedCount' })
  }));

  if (response.Item) {
    const item = unmarshall(response.Item);
    return item.count;
  }
};

const setSeedUserCount = async (count) => {
  await ddb.send(new PutItemCommand({
    TableName: process.env.TABLE_NAME,
    Item: marshall({
      id: 'seedCount',
      count: count
    })
  }));
};