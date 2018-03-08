param(
    [string]$buildVersion,
    [string]$gitHubApiKey
)
$ErrorActionPreference = 'Stop'

function Publish-ToGitHub($versionNumber, $commitId, $preRelease, $artifact, $gitHubApiKey)
{
    $data = @{
       tag_name = [string]::Format("v{0}", $versionNumber);
       target_commitish = $commitId;
       name = [string]::Format("v{0}", $versionNumber);
       body = '';
       prerelease = $preRelease;
    }

    $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($gitHubApiKey + ":x-oauth-basic"));

    $releaseParams = @{
       Uri = "https://api.github.com/repos/OctopusDeploy/TeamCityCloudAgentUpdater/releases";
       Method = 'POST';
       Headers = @{ Authorization = $auth; }
       ContentType = 'application/json';
       Body = ($data | ConvertTo-Json -Compress)
    }

    $result = Invoke-RestMethod @releaseParams
    $uploadUri = $result | Select-Object -ExpandProperty upload_url
    $uploadUri = $uploadUri -creplace '\{\?name,label\}'
    $uploadUri = $uploadUri + ("?name=$artifact".Replace('.\', ''))

    $params = @{
      Uri = $uploadUri;
      Method = 'POST';
      Headers = @{ Authorization = $auth; }
      ContentType = 'application/zip';
      InFile = $artifact
    }
    Invoke-RestMethod @params
}

Write-output "### Running npm install"
npm install

Write-output "### Enabling TLS 1.2 support"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12, [System.Net.SecurityProtocolType]::Tls11, [System.Net.SecurityProtocolType]::Tls

Compress-Archive -Path . -DestinationPath ".\TeamCityCloudAgentUpdater.$buildVersion.zip"

$commitId = git rev-parse HEAD
Publish-ToGitHub -versionNumber $buildVersion `
                 -commitId $commitId `
                 -preRelease $false `
                 -artifact ".\TeamCityCloudAgentUpdater.$buildVersion.zip" `
                 -gitHubApiKey $gitHubApiKey
