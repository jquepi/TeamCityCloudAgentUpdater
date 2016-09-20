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

//console.log('program.username = "' + program.username + '"');
//console.log('program.password = "' + program.password + '"');
//console.log('program.server = "' + program.server + '"');
//console.log('program.image = "' + program.image + '"');
//console.log('program.cloudprofile = "' + program.cloudprofile + '"');
//console.log('program.agentprefix = "' + program.agentprefix + '"');

var loadPhantomInstance = function () {

  var options = {
    phantomPath: './node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs',
    loadImages: true,
    injectJquery: true,
    webSecurity: true,
    ignoreSSLErrors: false,
    debugPort: 9000,
    timeout: 10000
  };

  var phantomInstance = new Horseman(options);

  phantomInstance.on('consoleMessage', function (msg) {
  	//TODO: change to opt in, rather than opt out
  	if (msg.indexOf('WebSocket: ') > -1) return;
  	if (msg.indexOf('Websocket ') > -1) return;
  	if (msg.indexOf('Atmosphere: ') > -1) return;
    console.log(colors.blue(msg));
  });

  phantomInstance.on('error', function (msg) {
  	//TODO: change to opt in
     console.error(colors.red('Phantom page error: ' + msg));
  });

  phantomInstance.on('resourceRequested', function(requestData, networkRequest) {
    console.log(colors.gray('Request (#' + requestData.id + '): ' + JSON.stringify(requestData)));
  });

  phantomInstance.on('navigationRequested', function(url, type, willNavigate, main) {
    console.log(colors.gray('Trying to navigate to: ' + url));
    console.log(colors.gray('Caused by: ' + type));
    console.log(colors.gray('Will actually navigate: ' + willNavigate));
    console.log(colors.gray("Sent from the page's main frame: " + main));
  });

  phantomInstance.on('resourceReceived', function(response) {
    console.log(colors.gray('Response (#' + response.id + ', stage "' + response.stage + '"): ' + JSON.stringify(response)));
  });

  phantomInstance.on('resourceReceived', function(response) {
    console.log(colors.gray('Response (#' + response.id + ', stage "' + response.stage + '"): ' + JSON.stringify(response)));
  });

  phantomInstance.on('loadFinished', function(status) {
    console.log(colors.blue('LoadFinished. Status: ' + status));
  });

  phantomInstance.on('urlChanged', function(targetUrl) {
    console.log(colors.blue('New URL: ' + targetUrl));
  });

  phantomInstance.on('resourceError', function(resourceError) {
    console.log(colors.red('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')'));
    console.log(colors.red('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString));
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
		throw "Unable to find cloud profile '" + cloudprofile + "'";
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
			console.log("For cloud profile '" + cloudprofile + "', agents with prefix '" + agentprefix + "' are currently set to use image '" + currentImage + "'");
			return;
		}
		throw "Unable to find cloud image with agent prefix '" + agentprefix + "'";
	}, program.cloudprofile, program.agentprefix);
}

var cloudDetailsToBeLoaded = function() {
	return $j('#amazonRefreshableParametersLoadingWrapper').is(":visible");
}

var updateSelectedImage = function() {
	return phantom.evaluate(function(cloudprofile, agentprefix, image){
		var option = $j('#source-id option[value="' + image + '"]');
	    if (option == null || option.length == 0)
	    	throw "Unable to find image '" + image + "'."
	    if (option.prop('selected')) {
    		console.log("Cloud profile is already using correct image. Nothing to do.");
    		return;
    	}
		option.prop('selected', true);
		$j('#source-id').change();
		console.log("Updating cloud profile '" + cloudprofile + "' so that agents with prefix '" + agentprefix + "' will use image '" + image + "'");
	}, program.cloudprofile, program.agentprefix, program.image);
}

phantom
	.open(program.server + "/login.html")
    .type('input[name="username"]', program.username)
	.type('input[name="password"]', program.password)
	.screenshot("01-beforelogin.jpg")
	.click('input[name="submitLogin"]')
	.screenshot("02-afterlogin.jpg")
	.waitForNextPage()
	//todo: throw error if not logged in
	.screenshot("03-afterwait.jpg")
	.open(program.server + "/admin/admin.html?item=clouds")
	.screenshot("04-afternavigatetocloud.jpg")
	.waitForNextPage()
	.screenshot("05-afterwait.jpg")
	.then(openCloudProfile)
	.screenshot("06-afternavigatetocloudprofile.jpg")
	.waitForNextPage()
	.screenshot("07-afterwait.jpg")
	.waitFor(cloudDetailsToBeLoaded)
	.screenshot("08-afterwaitforclouddetailstobeloaded.jpg")
	.then(openEditImageDialog)
	.screenshot("09-afteropeningimagedialog.jpg")
	.then(updateSelectedImage)
	.screenshot("10-afterupdateimage.jpg")
	.click('[id="addImageButton"]')
	.screenshot("11-aftersaveimage.jpg")
	.click('[id="createButton"]')
	.screenshot("12-aftersaveprofile.jpg")
	.waitForNextPage()
	.screenshot("13-aftersaveprofilewait.jpg")
	.catch(function (err) {
        console.log('Error: ', err);
    })
    .finally(function() {
   		return phantom.close();
    })
