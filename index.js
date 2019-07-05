'use strict';

var program = require('commander');
var colors = require('colors/safe');
var http = require('https');

program
  .version('1.0.0')
  .option('--token <string>', 'A valid TeamCity user access token (requires TC 2019.1)')
  .option('--server <string>', 'The url of the TeamCity server, eg "http://teamcity.example.com"')
  .option('--image <string>', 'The AMI id (for AWS), or full url to the VHD (for Azure)')
  .option('--cloudprofile <string>', 'The name of the TeamCity Cloud Profile to modify')
  .option('--agentprefix <string>', 'The agent prefix used in the Cloud Profile image that should be updated')
  .parse(process.argv);

var fail = function(message) {
  console.log(colors.red("ERROR: " + message));
  process.exit(1);
};
if (!program.token || program.token == "") fail('Option "token" was not supplied.')
if (!program.server || program.server == "") fail('Option "server" was not supplied.')
if (!program.image || program.image == "") fail('Option "image" was not supplied.')
if (!program.cloudprofile || program.cloudprofile == "") fail('Option "cloudprofile" was not supplied.')
if (!program.agentprefix || program.agentprefix == "") fail('Option "agentprefix" was not supplied.')

var auth = "Bearer " + program.token;

function getAuthorisedAgents(callback) {
  http.get({
    host: program.server.replace(/https?:\/\//, ''),
    path: '/app/rest/agents?locator=authorized:true',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth
    },
    agent: false
  }, function(response) {
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
          var parsed = JSON.parse(body);
          callback(parsed);
      });
  }).end();
}

function getAgentDetails(href, callback) {
  http.get({
    host: program.server.replace(/https?:\/\//, ''),
    path: href,
    headers: {
      'accept': 'application/json',
      "Authorization" : auth
    },
    agent: false
  }, function(response) {
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
          var parsed = JSON.parse(body);
          callback(parsed);
      });
  }).end();
}

function disableAgent(agent, image) {
  var req = http.request({
    host: program.server.replace(/https?:\/\//, ''),
    path: agent.href + "/enabledInfo",
    method: 'PUT',
    headers: {
      'content-type': 'application/xml',
      'Authorization' : auth,
      'Origin': program.server
    },
    agent: false
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 2."));
          process.exit(2);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.cyan("INFO: Successfully disabled agent " + agent.id + " from teamcity."));
        console.log(colors.gray("VERBOSE: " + body));
      });
  });

  req.on('error', function (e) {
    console.log(colors.red("ERROR: " + e));
    console.log(colors.red("ERROR: Got error when disabling agent. Exiting with exit code 3."));
    process.exit(3);
  });

  req.on('timeout', function () {
    console.log(colors.red("ERROR: timeout"));
    req.abort();
  });

  req.write("<enabledInfo status='false'><comment><text>Disabling agent as it uses base image " + image + ", which has been superseded by base image " + program.image + ".</text></comment></enabledInfo>");

  req.end();
}

function getAgentProperty(agent, propertyName) {
  var result = null;
  agent.properties.property.forEach(function(property) {
      if (property.name == propertyName) {
        result = property.value;
      }
    });
  return result;
}

function checkAgentMatches(agent, image, success, failure) {
    if (agent.properties) {
      var propertyName;
      propertyName = 'system.ec2.ami-id';

      var reportedAmiId = getAgentProperty(agent, propertyName);
    }

    if ((reportedAmiId == image)) {
      console.log(colors.cyan("INFO: Disabling agent " + agent.id + " as it uses old image " + reportedAmiId));
      success(agent);
    }
    else {
      failure(agent);
    }
}

function disableAgentWith(agents, image) {
  var failureCount = 0;
  agents.forEach(function(agent) {
      getAgentDetails(agent.href, function(agentDetails) {
        var success = function(agent) {
            disableAgent(agent, image);
        };
        var failure = function () {
          failureCount++;
          if (failureCount == agents.length) {
            console.log(colors.cyan("INFO: No agents with image = '" + image + "' found. Nothing to disable."));
          }
        };

        checkAgentMatches(agentDetails, image, success, failure);
      })
    })
}

function disableOldAgents(oldImage) {
  console.log(colors.cyan("INFO: Attempting to disable teamcity agents that use image " + oldImage));
  getAuthorisedAgents(function(response) {
    var agents = response.agent;
    disableAgentWith(agents, oldImage);
  });
}

var getRootProjectFeatures = function(callback) {
  http.get({
    host: program.server.replace(/https?:\/\//, ''),
    path: '/app/rest/projects/id:_Root/projectFeatures',
    headers: {
      'accept': 'application/json',
      "Authorization" : auth
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 4."));
          process.exit(4);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
          var parsed = JSON.parse(body);
          callback(parsed);
      });
  }).end();
}

function getFeatureProperty(feature, propertyName) {
  var result = null;
  feature.properties.property.forEach(function(property) {
    if (property.name == propertyName) {
      result = property.value;
    }
  });
  if (result)
    return result;
  console.log(colors.red("ERROR: Unable to find property '" + propertyName + "' on '" + JSON.stringify(feature) + "'. Exiting with code 5."));
  process.exit(5);
}

function setFeatureProperty(feature, propertyName, newValue) {
  feature.properties.property.forEach(function(property) {
    if (property.name == propertyName) {
      property.value = newValue;
      return;
    }
  });
}

var getCloudProfile = function(response) {
  var features = response.projectFeature;
  var returnFeature;
  features.forEach(function(feature) {
    if (feature.type === 'CloudProfile') {
      if (getFeatureProperty(feature, 'name') == program.cloudprofile) {
        returnFeature = feature;
      }
    }
  });
  if (returnFeature)
    return returnFeature;
  console.log(colors.red("ERROR: Unable to find Cloud Profile '" + program.cloudprofile + "'. Exiting with code 6."));
  process.exit(6);
}

var getCloudImage = function(cloudProfile, response) {
  var cloudProfileId = cloudProfile.id;
  var features = response.projectFeature;
  var returnFeature;
  features.forEach(function(feature) {
    if (feature.type === 'CloudImage') {
      if (getFeatureProperty(feature, 'profileId') === cloudProfileId) {
        if (getFeatureProperty(feature, 'image-name-prefix') === program.agentprefix) {
          returnFeature = feature;
        }
      }
    }
  });
  if (returnFeature)
    return returnFeature;
  console.log(colors.red("ERROR: Unable to find Cloud Image with profileid '" + cloudProfileId + "' and image-name-prefix '" + program.agentprefix + "'.  Exiting with code 7."));
  process.exit(7);
}

function updateCloudImage(cloudImage, callback) {
  var host = program.server.replace(/https?:\/\//, '')
  var path = '/app/rest/projects/id:_Root/projectFeatures/type:CloudImage,property(name:image-name-prefix,value:' + program.agentprefix + ')/properties/amazon-id'
  var req = http.request({
    host: host,
    path: path,
    method: 'PUT',
    headers: {
      'Authorization': auth,
      'Content-type': 'text/plain',
      'Origin': program.server
    }
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          console.log(colors.gray("VERBOSE: Server returned status code " + response.statusCode));
          console.log(colors.cyan("INFO: Successfully updated cloudImage " + cloudImage.id + " in teamcity."));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 8."));
          process.exit(8);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.gray("VERBOSE" + body));
        callback();
      });
  });

  req.on('error', function (e) {
    console.log(colors.red(e));
    console.log(colors.red("ERROR: Got error when updating cloudImage. Exiting with exit code 9."));
    process.exit(9);
  });

  req.on('timeout', function () {
    req.abort();
    console.log(colors.red("ERROR: Got timeout when updating cloudImage. Exiting with exit code 10."));
    process.exit(10);
  });

  req.write(program.image);

  req.end();
}

getRootProjectFeatures(function (features) {
  var cloudProfile = getCloudProfile(features);
  var cloudImage = getCloudImage(cloudProfile, features);
  var ami = getFeatureProperty(cloudImage, 'amazon-id');
  if (ami == program.image) {
    console.log(colors.cyan("INFO: TeamCity cloud profile '" + program.cloudprofile + "', image '" + program.agentprefix + "' is already set to use '" + program.image + "'"));
  } else {
    console.log(colors.cyan("INFO: TeamCity cloud profile '" + program.cloudprofile + "', image '" + program.agentprefix + "' is currently set to use '" + ami + "'. Updating to use '" + program.image + "'."));
    setFeatureProperty(cloudImage, 'amazon-id', program.image);
    updateCloudImage(cloudImage, function() {
      disableOldAgents(ami);
    });
  }
});
