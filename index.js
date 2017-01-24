'use strict';

var Horseman = require('node-horseman');
var program = require('commander');
var colors = require('colors/safe');
var http = require('https');

program
  .version('1.0.0')
  .option('--username <string>', 'The valid TeamCity username')
  .option('--password <string>', 'Password for the TeamCity user')
  .option('--server <string>', 'The url of the TeamCity server, eg "http://teamcity.example.com"')
  .option('--image <string>', 'The AMI id (for AWS), or full url to the VHD (for Azure)')
  .option('--cloudprofile <string>', 'The name of the TeamCity Cloud Profile to modify')
  .option('--agentprefix <string>', 'The agent prefix used in the Cloud Profile image that should be updated')
  .parse(process.argv);

var fail = function(message) {
  console.log(colors.red("ERROR: " + message));
  process.exit(1);
};
if (!program.username || program.username == "") fail('Option "username" was not supplied.')
if (!program.password || program.password == "") fail('Option "password" was not supplied.')
if (!program.server || program.server == "") fail('Option "server" was not supplied.')
if (!program.image || program.image == "") fail('Option "image" was not supplied.')
if (!program.cloudprofile || program.cloudprofile == "") fail('Option "cloudprofile" was not supplied.')
if (!program.agentprefix || program.agentprefix == "") fail('Option "agentprefix" was not supplied.')

var platform = "";
var oldImage = "";
var phantomPath ='./node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs'
var isWin = /^win/.test(process.platform);
if (isWin) {
  phantomPath ='./node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs.exe'
}

var loadPhantomInstance = function () {

  var options = {
    phantomPath: phantomPath,
    loadImages: true,
    injectJquery: true,
    webSecurity: true,
    ignoreSSLErrors: false,
    debugPort: 9000,
    timeout: 10000
  };

  var phantomInstance = new Horseman(options);

  function isOurMessage(msg) {
    return msg.toString().indexOf('TeamCityCloudAgentUpdater') > -1;
  }

  function cleanupMessage(msg) {
    return msg.toString()
              .replace('TeamCityCloudAgentUpdater: ', '')
              .replace('[object Object],[object Object]', '');
  }

  phantomInstance.on('consoleMessage', function (msg) {
    if (isOurMessage(msg))
      if (msg.indexOf("VERBOSE:") > -1)
        console.log(colors.gray(cleanupMessage(msg)));
      else
        console.log(colors.cyan(cleanupMessage(msg)));
  });

  phantomInstance.on('error', function (msg) {
    if (isOurMessage(msg))
      console.error(colors.red(cleanupMessage(msg)));
      if (msg.toString().indexOf("FATAL:") > -1)
          process.exit(1);
  });

  return phantomInstance;
};

var phantom = loadPhantomInstance();

var openCloudProfile = function (){
  console.log(colors.gray("VERBOSE: Opening cloud profile"));
  return phantom.evaluate(function(cloudprofile){
    var link = null;
    $j('div#cloudRefreshableInner table tr').each(function(index, item){
      var firstTableCell = item.children[0]
      if (firstTableCell.tagName == 'TD') {
        var result = $j(firstTableCell)
          .clone()    //clone the element
          .children() //select all the children
          .remove()   //remove all the children
          .end()      //again go back to selected element
          .text()
          .trim();
          if (result == cloudprofile) {
            link = firstTableCell;
            return;
          }
      }
    });
    if (link) {
      $j(link).click();
      return;
    }
    throw "TeamCityCloudAgentUpdater: FATAL: Unable to find cloud profile '" + cloudprofile + "'";
  }, program.cloudprofile);
}

var openEditImageDialog = function () {
  console.log(colors.gray("VERBOSE: Opening edit image dialog"));
  return phantom.evaluate(function(cloudprofile, agentprefix){
    if ($j('#source_images_json').length > 0) {
      //aws
      var json = $j('#source_images_json').attr('value');
      var images = JSON.parse(json);

      var index = -1;
      $(images).each(function(elem, i){
        if (elem['image-name-prefix'] == agentprefix) { index = i; }
      });

      if (index > -1) {
        $j($j('table#amazonImagesTable').find('tr')[index + 1]).find('td')[0].click();
        var currentImage = $j('#source-id option:selected').val();
        console.log("TeamCityCloudAgentUpdater: INFO: For cloud profile '" + cloudprofile + "', agents with prefix '" + agentprefix + "' are currently set to use image '" + currentImage + "'");
        return { platform: "amazon", oldImage: currentImage };
      }
      throw "TeamCityCloudAgentUpdater: FATAL: Unable to find amazon cloud image with agent prefix '" + agentprefix + "' in cloud profile '" + cloudprofile + "'";
    }
    else {
      //azure
      var json = $j('[name="prop:images_data"]').attr('value');
      var images = JSON.parse(json);

      var index = -1;
      $(images).each(function(elem, i){
        if (elem.vmNamePrefix == agentprefix) { index = i; }
      });

      if (index > -1) {
        $j($j('table.imagesTable').find('tr')[index + 1]).find('td.edit a')[0].click();
        var currentImage = $j('input[name="imageUrl"]').val();
        console.log("TeamCityCloudAgentUpdater: INFO: For cloud profile '" + cloudprofile + "', agents with prefix '" + agentprefix + "' are currently set to use image '" + currentImage + "'");
        return { platform: "azure", oldImage: currentImage };
      }
      throw "TeamCityCloudAgentUpdater: FATAL: Unable to find azure cloud image with agent prefix '" + agentprefix + "' in cloud profile '" + cloudprofile + "'";
    }
  }, program.cloudprofile, program.agentprefix);
}

var openEditImageDialogAndValidateSetCorrectly = function () {
  console.log(colors.gray("VERBOSE: Validating cloud image set correctly"));
  return phantom.evaluate(function(cloudprofile, agentprefix, image){
    if ($j('#source_images_json').length > 0) {
      //aws
      var json = $j('#source_images_json').attr('value');
      var images = JSON.parse(json);

      var index = -1;
      $(images).each(function(elem, i){
        if (elem['image-name-prefix'] == agentprefix) { index = i; }
      });

      if (index > -1) {
        $j($j('table#amazonImagesTable').find('tr')[index + 1]).find('td')[0].click();
        var currentImage = $j('#source-id option:selected').val();
        if (currentImage == image)
          console.log("TeamCityCloudAgentUpdater: INFO: Successfully updated cloud profile '" + cloudprofile + "'.");
        else
          throw "TeamCityCloudAgentUpdater: FATAL: Failed to update cloud image.";
        return;
      }
    }
    else {
      //azure
      var json = $j('[name="prop:images_data"]').attr('value');
      var images = JSON.parse(json);

      var index = -1;
      $(images).each(function(elem, i){
        if (elem.vmNamePrefix == agentprefix) { index = i; }
      });

      if (index > -1) {
        $j($j('table.imagesTable').find('tr')[index + 1]).find('td.edit a')[0].click();
        var currentImage = $j('input[name="imageUrl"]').val();
        if (currentImage == image)
          console.log("TeamCityCloudAgentUpdater: INFO: Successfully updated cloud profile '" + cloudprofile + "'.");
        else
          throw "TeamCityCloudAgentUpdater: FATAL: Failed to update cloud image.";
        return;
      }
    }
    throw "TeamCityCloudAgentUpdater: FATAL: Unable to find cloud image with agent prefix '" + agentprefix + "'";

  }, program.cloudprofile, program.agentprefix, program.image);
}

var cloudDetailsToBeLoaded = function() {
  console.log("TeamCityCloudAgentUpdater: VERBOSE: Waiting for cloud details to be loaded");
  return $j('#amazonRefreshableParametersLoadingWrapper').is(":visible") //aws
         || $j('table td.edit a').is(":visible");                        //azure
}

var updateSelectedImage = function() {
  return phantom.evaluate(function(cloudprofile, agentprefix, image){
    console.log("TeamCityCloudAgentUpdater: INFO: Updating cloud profile '" + cloudprofile + "' so that agents with prefix '" + agentprefix + "' will use image '" + image + "'");
    if ($j('#source-id').length > 0) {
      console.log("TeamCityCloudAgentUpdater: VERBOSE: In aws flow");
      //aws
      var option = $j('#source-id option[value="' + image + '"]');
      console.log("TeamCityCloudAgentUpdater: VERBOSE: Option = " + option);
      if (option == null || option.length == 0)
        throw "TeamCityCloudAgentUpdater: FATAL: Unable to find image '" + image + "'.";
      if (option.prop('selected')) {
        console.log("TeamCityCloudAgentUpdater: INFO: Cloud profile is already using correct image. Nothing to do.");
        return;
      }
      console.log("TeamCityCloudAgentUpdater: VERBOSE: Setting 'selected' to 'true'");
      option.prop('selected', true);
      console.log("TeamCityCloudAgentUpdater: VERBOSE: Calling change()");
      $j('#source-id').change();
      console.log("TeamCityCloudAgentUpdater: VERBOSE: Click addImageButton");
      $j('[id="addImageButton"]').click();
      console.log("TeamCityCloudAgentUpdater: VERBOSE: Click createButton");
      $j('[id="createButton"]').click();
      console.log("TeamCityCloudAgentUpdater: VERBOSE: Done");
    }
    else {
      //azure
      var currentImage = $j('input[name="imageUrl"]').val();
      if (currentImage == image) {
        console.log("TeamCityCloudAgentUpdater: INFO: Cloud profile is already using correct image. Nothing to do.");
        return;
      }
      $j('input[name="imageUrl"]').val(image)
      $j('input[name="imageUrl"]').change();
      $j('div#ArmImageDialog input.submitButton').click();
      $j('div#newProfileFormDialog input.submitButton').click();
    }
    console.log("TeamCityCloudAgentUpdater: INFO: Updated cloud profile '" + cloudprofile + "' so that agents with prefix '" + agentprefix + "' will use image '" + image + "'");
  }, program.cloudprofile, program.agentprefix, program.image);
}

var checkForTerminateInstanceDialog = function() {
  console.log(colors.gray("TeamCityCloudAgentUpdater: VERBOSE: Checking for 'Terminate Instance?' dialog"));
  return phantom.evaluate(function(){
    if ($j('#RemoveImageDialog').is(":visible")) {
      console.log("TeamCityCloudAgentUpdater: VERBOSE: 'Terminate Instance?' has displayed, unticking terminate checkbox and submitting");
      //uncheck the 'terminate instance' checkbox
      $j('#terminateInstances').prop('checked', false);
      $j('#removeImageConfirmButton').click()
    }
    else {
      console.log("TeamCityCloudAgentUpdater: VERBOSE: 'Terminate Instance?' did not display");
    }
  });
}

var confirmLoggedIn = function() {
  return phantom.evaluate(function(username) {
    if ($j('input[name="submitLogin"]').length > 0)
      throw "TeamCityCloudAgentUpdater: FATAL: Unable to login with username '" + username + "'.";
    else
      console.log("TeamCityCloudAgentUpdater: INFO: Successfully logged with username '" + username + "'.");
  }, program.username);
}

var handleErrors = function (err) {
  console.log('TeamCityCloudAgentUpdater: FATAL: ', err);
}

var cleanUp = function() {
  console.log(colors.gray("VERBOSE: Cleaning up"));
  return phantom.close();
}

function getAuthorisedAgents(callback) {
  http.get({
    host: program.server.replace(/https?:\/\//, ''),
    path: '/httpAuth/app/rest/agents?locator=authorized:true',
    headers: {
      'accept': 'application/json',
      "Authorization" : "Basic " + new Buffer(program.username + ":" + program.password).toString("base64")
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
      "Authorization" : "Basic " + new Buffer(program.username + ":" + program.password).toString("base64")
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
      "Authorization" : "Basic " + new Buffer(program.username + ":" + program.password).toString("base64")
    },
    agent: false
  }, function(response) {
      if (('' + response.statusCode).match(/^2\d\d$/)) {
          //console.log(colors.cyan("INFO: Server returned status code " + response.statusCode));
      } else {
          console.log(colors.red("ERROR: Server returned non-2xx status code " + response.statusCode + ". Exiting with exit code 3."));
          process.exit(3);
      }
      var body = '';
      response.on('data', function(d) {
          body += d;
      });
      response.on('end', function() {
        console.log(colors.cyan("INFO: Successfully disabled agent " + agent.id + " from teamcity."));
      });
  });

  req.on('error', function (e) {
    console.log(colors.red("ERROR: " + e));
    console.log(colors.red("ERROR: Got error when disabling agent. Exiting with exit code 4."));
    process.exit(4);
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

function checkAgentMatches(agent, platform, image, success, failure) {
    var reportedInstanceName = null;
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

function disableAgentWith(agents, platform, image) {
  var failureCount = 0;
  agents.forEach(function(agent) {
      getAgentDetails(agent.href, function(agentDetails) {
        var success = function(agent) {
            disableAgent(agent, image);
          console.log(colors.cyan("INFO: Disabling agent " + agent.id + " as it uses old image " + image));
        };
        var failure = function (agent) {
          failureCount++;
          if (failureCount == agents.length) {
            console.log(colors.cyan("INFO: No agents with platform = '" + platform + "', image = '" + image + "' found. Nothing to disable."));
          }
        };

        checkAgentMatches(agentDetails, platform, image, success, failure);
      })
    })
}

function rememberOldImageDetails(result) {
  platform = result.platform;
  oldImage = result.oldImage;
}

function disableOldAgents() {
  console.log(colors.gray("VERBOSE: Disabling old agents"));
  if (platform != "amazon") {
    console.log(colors.cyan("WARN: Unable to disable teamcity agents - platform " + platform + " not yet implemented."))
  }
  else {
    console.log(colors.cyan("INFO: Attempting to disable teamcity agents that use image " + oldImage));
    getAuthorisedAgents(function(response) {
      var agents = response.agent;
      disableAgentWith(agents, platform, oldImage);
    });
  }
}

phantom
  .open(program.server + "/login.html")
  //login
  .type('input[name="username"]', program.username)
  .type('input[name="password"]', program.password)
  .click('input[name="submitLogin"]')
  .waitForNextPage()
  .then(confirmLoggedIn)
  //navigate to cloud image dialog
  .open(program.server + "/admin/admin.html?item=clouds")
  .waitForNextPage()
  .then(openCloudProfile)
  .waitForNextPage()
  .waitFor(cloudDetailsToBeLoaded)
  .then(openEditImageDialog)
  //save the old image details so we can use it later
  .then(rememberOldImageDetails)
  //update
  .then(updateSelectedImage)
  .waitForNextPage()
  .then(checkForTerminateInstanceDialog)
  .waitForNextPage()
  //validate
  .open(program.server + "/admin/admin.html?item=clouds")
  .waitForNextPage()
  .then(openCloudProfile)
  .waitForNextPage()
  .waitFor(cloudDetailsToBeLoaded)
  .then(openEditImageDialogAndValidateSetCorrectly)
  //disable any agents that use the old image so they dont run any new builds
  .then(disableOldAgents)
  .catch(handleErrors)
  .finally(cleanUp)
