& npm install

# the phantomjs-prebuilt module doesn't include the windows binary. Download and add it in.

Invoke-WebRequest -Uri "https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-windows.zip" -OutFile "phantomjs-2.1.1-windows.zip"

Expand-Archive -Path "./phantomjs-2.1.1-windows.zip" -DestinationPath "." -force

Copy-Item "./phantomjs-2.1.1-windows/bin/phantomjs.exe" "./node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs.exe"

Remove-Item "./phantomjs-2.1.1-windows" -force -recurse

Remove-Item "./phantomjs-2.1.1-windows.zip" -force
