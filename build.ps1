& npm install

# the phantomjs-prebuilt module doesn't include the windows binary. Download and add it in.
Invoke-WebRequest -Uri "https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-windows.zip" -OutFile "phantomjs-2.1.1-windows.zip"

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition

$shell = new-object -com shell.application
$zip = $shell.NameSpace("$PSScriptRoot/phantomjs-2.1.1-windows.zip")
foreach($item in $zip.items())
{
    $shell.Namespace("$PSScriptRoot").copyhere($item)
}

Copy-Item "./phantomjs-2.1.1-windows/bin/phantomjs.exe" "./node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs.exe"

Remove-Item "./phantomjs-2.1.1-windows" -force -recurse

Remove-Item "./phantomjs-2.1.1-windows.zip" -force
