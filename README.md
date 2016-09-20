# TeamCityCloudAgentUpdater
Simple NodeJS app to update AMI's for TeamCity Cloud Agents

Currently only supports AMI's. Support for Azure VHD's is planned soon.

## Usage

```
node index.js --username myusername --password MyPassword --server https://teamcity.example.com --image ami-XXXXXXX --cloudprofile "AWS Agents" --agentprefix "Ubuntu"
```
