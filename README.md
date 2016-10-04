# TeamCityCloudAgentUpdater
Simple NodeJS app to update AMI's for TeamCity Cloud Agents

Currently only supports AMI's. Support for Azure VHD's is planned soon.

At present, the TeamCity API does not support updating Cloud Agents, though there is a [feature request](https://youtrack.jetbrains.com/issue/TW-41139) logged. At present, the [recommended workaround](https://youtrack.jetbrains.com/issue/TW-41139#comment=27-1414938) is by "emulating the HTTP requests sent by the browser on editing the profiles.". This app uses a headless browser (PhantomJS) to login and perform the update.

## Usage

```
node index.js --username myusername --password MyPassword --server https://teamcity.example.com --image ami-XXXXXXX --cloudprofile "AWS Agents" --agentprefix "Ubuntu"
```

## License

This project is licensed under the Apache 2.0 license.
