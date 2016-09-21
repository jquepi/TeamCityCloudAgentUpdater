& npm install

# the phantomjs-prebuilt module doesn't include the windows binary. Download and add it in.

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition

$url = "https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-windows.zip"
$downloadDest = "$PSScriptRoot/phantomjs-2.1.1-windows.zip"

write-host "Downloading '$url' to '$downloadDest'"

Invoke-WebRequest -Uri $url -OutFile $downloadDest

write-host "Extracting '$downloadDest'"

$shell = new-object -com shell.application
$zip = $shell.NameSpace("$$downloadDest")
foreach($item in $zip.items())
{
    $shell.Namespace("$PSScriptRoot").copyhere($item)
}

write-host "Copying to node-modules"

Copy-Item "$PSScriptRoot/phantomjs-2.1.1-windows/bin/phantomjs.exe" "./node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs.exe"

write-host "Removing directory"

Remove-Item "$PSScriptRoot/phantomjs-2.1.1-windows" -force -recurse

write-host "Removing zip file"

Remove-Item $downloadDest -force
