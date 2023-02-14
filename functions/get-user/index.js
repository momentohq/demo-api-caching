const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { MetricUnits } = require('@aws-lambda-powertools/metrics');
const { CacheGet } = require('@gomomento/sdk');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const shared = require('/opt/nodejs/index');

const ddb = new DynamoDBClient();

exports.handler = async (event) => {
  try {
    const start = new Date();
    const { userId } = event.pathParameters;
    if (process.env.USE_CACHE == 'true') {
      const momento = await shared.getCacheClient();
      const cacheResponse = await momento.dictionaryFetch(shared.CACHE_NAME, userId);
      if (cacheResponse instanceof CacheGet.Hit) {
        recordMetrics(start, new Date());
        const cachedUser = cacheResponse.valueRecord();
        delete cachedUser.followers;
        return {
          status: 200,
          body: JSON.stringify(cachedUser)
        };
      }

      const user = await getFromDynamo(userId);
      if (!user) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: `A user with the id '${userId}' could not be found.` })
        };
      }
      recordMetrics(start, new Date());

      // Add the loaded user from Dynamo to the dictionary
      const fields = Object.entries(user).map(entry => { return [entry[0], entry[1].toString()] });
      await momento.dictionarySetFields(shared.CACHE_NAME, userId, new Map(fields));

      delete user.followers;
      return {
        statusCode: 200,
        body: JSON.stringify(user)
      };
    } else {
      const user = await getFromDynamo(userId);
      if (!user) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: `A user with the id '${userId}' could not be found.` })
        };
      }

      recordMetrics(start, new Date());
      delete user.followers;
      return {
        statusCode: 200,
        body: JSON.stringify(user)
      };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Something went wrong' })
    };
  }
};

const recordMetrics = (start, end) => {
  shared.metrics.addMetric(`${process.env.METRIC_NAME}-backend-latency`, MetricUnits.Milliseconds, (end - start));
  shared.metrics.publishStoredMetrics();
};

const getFromDynamo = async (userId) => {
  const response = await ddb.send(new GetItemCommand({
    TableName: process.env.TABLE_NAME,
    Key: marshall({ id: userId })
  }));

  if (response.Item) {
    const user = unmarshall(response.Item);

    return user;
  }
};