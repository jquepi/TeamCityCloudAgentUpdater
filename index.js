'use strict';

var Horseman = require('node-horseman');
var program = require('commander');
var colors = require('colors/safe');

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
	console.log(message);
	process.exit(1);
};
if (!program.username || program.username == "") fail('Option "username" was not supplied.')
if (!program.password || program.password == "") fail('Option "password" was not supplied.')
if (!program.server || program.server == "") fail('Option "server" was not supplied.')
if (!program.image || program.image == "") fail('Option "image" was not supplied.')
if (!program.cloudprofile || program.cloudprofile == "") fail('Option "cloudprofile" was not supplied.')
if (!program.agentprefix || program.agentprefix == "") fail('Option "agentprefix" was not supplied.')

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

  phantomInstance.on('consoleMessage', function (msg) {
  	if (msg.toString().indexOf('TeamCityCloudAgentUpdater') > -1)
      console.log(colors.blue(msg));
  });

  phantomInstance.on('error', function (msg) {
  	if (msg.toString().indexOf('TeamCityCloudAgentUpdater') > -1)
	  console.error(colors.red(msg));
  });

  return phantomInstance;
};

var phantom = loadPhantomInstance();

var openCloudProfile = function (){
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
		throw "TeamCityCloudAgentUpdater: Unable to find cloud profile '" + cloudprofile + "'";
	}, program.cloudprofile);
}

var openEditImageDialog = function () {
	return phantom.evaluate(function(cloudprofile, agentprefix){
		var json = $j('#source_images_json').attr('value');
		var images = JSON.parse(json);

		var index = -1;
		$(images).each(function(elem, i){
			if (elem['image-name-prefix'] == agentprefix) { index = i; }
		});

		if (index > -1) {
			$j($j('table#amazonImagesTable').find('tr')[index + 1]).find('td')[0].click();
			var currentImage = $j('#source-id option:selected').val();
			console.log("TeamCityCloudAgentUpdater: For cloud profile '" + cloudprofile + "', agents with prefix '" + agentprefix + "' are currently set to use image '" + currentImage + "'");
			return;
		}
		throw "TeamCityCloudAgentUpdater: Unable to find cloud image with agent prefix '" + agentprefix + "'";
	}, program.cloudprofile, program.agentprefix);
}

var cloudDetailsToBeLoaded = function() {
	return $j('#amazonRefreshableParametersLoadingWrapper').is(":visible");
}

var updateSelectedImage = function() {
	return phantom.evaluate(function(cloudprofile, agentprefix, image){
		var option = $j('#source-id option[value="' + image + '"]');
	    if (option == null || option.length == 0)
	    	throw "TeamCityCloudAgentUpdater: Unable to find image '" + image + "'."
	    if (option.prop('selected')) {
    		console.log("TeamCityCloudAgentUpdater: Cloud profile is already using correct image. Nothing to do.");
    		return;
    	}
		option.prop('selected', true);
		$j('#source-id').change();
		console.log("TeamCityCloudAgentUpdater: Updating cloud profile '" + cloudprofile + "' so that agents with prefix '" + agentprefix + "' will use image '" + image + "'");
	}, program.cloudprofile, program.agentprefix, program.image);
}

phantom
	.open(program.server + "/login.html")
    .type('input[name="username"]', program.username)
	.type('input[name="password"]', program.password)
	.click('input[name="submitLogin"]')
	.waitForNextPage()
	//todo: throw error if not logged in
	.open(program.server + "/admin/admin.html?item=clouds")
	.waitForNextPage()
	.then(openCloudProfile)
	.waitForNextPage()
	.waitFor(cloudDetailsToBeLoaded)
	.then(openEditImageDialog)
	.then(updateSelectedImage)
	.click('[id="addImageButton"]')
	.click('[id="createButton"]')
	.waitForNextPage()
	.catch(function (err) {
        console.log('TeamCityCloudAgentUpdater: Error: ', err);
    })
    .finally(function() {
   		return phantom.close();
    })
