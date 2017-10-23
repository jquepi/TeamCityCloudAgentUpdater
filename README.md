# TeamCityCloudAgentUpdater

Simple NodeJS app to update images for TeamCity Cloud Agents, via the 2017.1 API. Also disables any agents that are running that are based on the old image.

## Usage

```
node index.js --username myusername --password MyPassword --server https://teamcity.example.com --image ami-XXXXXXX --cloudprofile "AWS Agents" --agentprefix "Ubuntu"

```

## License

This project is licensed under the Apache 2.0 license.
