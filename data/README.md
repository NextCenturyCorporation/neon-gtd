The example dashboards require the earthquakes data from the neon project (see that project's
examples/README.md for details on how to import it) and the contracts data found here.

To import the contracts data into a MongoDB, run the following commands:

    unzip contracts.zip
    mongoimport --db uscontracts --collection testcontracts --type json --stopOnError --file contracts.json

This example data was collected from
https://www.usaspending.gov/DownloadCenter/Pages/dataarchives.aspx and modified heavily for the
purposes of demonstration. A random sample of the April-July 2014 data was taken. Only records that
had valid US zip codes were kept. Latitudes and longitudes were assigned using the mapping from zip
codes found in http://download.geonames.org/export/zip/US.zip.
