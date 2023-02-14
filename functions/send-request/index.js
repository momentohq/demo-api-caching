const axios = require('axios').default;
const { MetricUnits } = require('@aws-lambda-powertools/metrics');
const shared = require('/opt/nodejs/index');

exports.handler = async (event) => {
  await Promise.allSettled(event.Records.map(async (record) => {
    await runEndpointRequest(JSON.parse(record.body));
  }));

  shared.metrics.publishStoredMetrics();  
};

const runEndpointRequest = async (request) => {
  const config = getAxiosConfig(request);

  const start = new Date();
  const response = await axios.request(config);
  const end = new Date();
  const duration = end - start;

  shared.metrics.addMetric(`${request.metricName}-network-latency`, MetricUnits.Milliseconds, duration);
  shared.metrics.addMetric(`${request.metricName}-total-calls`, MetricUnits.Count, 1);
  if(response.status >= 400){
    shared.metrics.addMetric(`${request.metricName}-failures`, MetricUnits.Count, 1);
  } else {
    shared.metrics.addMetric(`${request.metricName}-successes`, MetricUnits.Count, 1);
  }
}

const getAxiosConfig = (request) => {
  const config = {
    method: request.method,
    baseURL: request.baseUrl,
    headers: request.headers ?? {},
    ...request.body && { data: request.body },
    responseType: 'json',
    validateStatus: (status) => true
  };

  if (request.auth) {
    let authValue = request.auth.authToken;
    if (request.auth.prefix) {
      authValue = `${request.auth.prefix} ${authValue}`;
    }

    if (request.auth.location == 'query') {
      config.baseURL = `${config.baseURL}?${request.auth.key}=${authValue}`;
    } else if (request.auth.location == 'header') {
      config.headers[request.auth.key] = authValue;
    }
  }

  if (request.query) {
    const query = Object.entries(request.query).map(entry => `${entry[0]}=${entry[1]}`).join('&');
    if (config.baseURL.includes('?')) {
      config.baseURL = `${config.baseURL}&${query}`;
    } else {
      config.baseURL = `${config.baseURL}?${query}`;
    }
  }

  return config;
};