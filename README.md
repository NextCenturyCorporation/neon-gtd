#Neon Geo Temporal Dashboard Overview

The Neon Geo Temporal Dashboard (neon-gtd) is a sample analysis dashboard built upon the [Neon Framework][5]. It includes a number of geo-spatial and temporal data visualizations built as Angular directives that use the Neon framework to query and filter data hosted in [MongoDB][8] or [Spark][9].  Additionally, each of the dashboard components can funtion as a widget within the [OZONE Widget Framework][7].

[Neon][5] is a software platform designed to help developers integrate disparate visualization widgets with your data stores. It includes a **Data Access API** that makes it easy for to query an underlying database directly from JavaScript or RESTful endpoints. Additionally, the [Neon][5] **Interaction API** provides capabilities for inter-widget communication and shared data filters, allowing multiple visualizations to interact without tight coupling.

## View an example application
To see an example of this project, check out our [demo server](http://54.88.152.130:8080/neon-examples/angular-demo/app/). Read more about how to use it and how it interacts with Neon [here](https://github.com/NextCenturyCorporation/neon/wiki/Demo-App-QuickStart-Guide).

## Build and run the example
Building the example application requires Java JDK 1.7 or 1.8, node.js, and MongoDB. To install everything you need on Ubuntu 14.04, run

    sudo apt-get install git openjdk-7-jdk mongodb unzip npm nodejs-legacy

On Fedora 20, run

    sudo yum install git unzip mongodb mongodb-server java-1.7.0-openjdk-devel npm
    sudo systemctl start mongod

1. [Build and Deploy a Neon server][2] or simply drop the [latest neon.war](http://neonframework.org/versions/latest/) in a web application container such as [Tomcat](http://tomcat.apache.org/).
2. Clone the neon-gtd repo

        git clone https://github.com/NextCenturyCorporation/neon-gtd.git
        cd neon-gtd/
        
3. Use npm and grunt to download dependencies and build the application.  This will create a neon-gtd war file in  the neon-gtd/target directory.
        npm install
        grunt

4. Deploy the neon-gtd-<version>.war file to your container from step 1.

    
[demo]: http://localhost:8080/neon/examples/angular-demo/app/
[demo-guide]: https://github.com/NextCenturyCorporation/neon/wiki/Demo-App-User-Guide

##Documentation

**[Neon Wiki][1]** - Visit the Neon wiki for more information on what Neon can do for you.

**[Build Instructions][2]** - Includes instructions for building the Neon WAR file from source code and lists Neon's external dependencies.

**[Deploying Neon][3]** - Includes instructions for deploying the Neon application to a web server (e.g., Jetty and Tomcat).

**[Developer Quick Start Guide][4]** - A quick tour of how to develop apps that use Neon.

## Additional Information

Email: neon-support@nextcentury.com

Website: [http://neonframework.org][5]

Copyright 2014 Next Century Corporation

[1]: https://github.com/NextCenturyCorporation/neon/wiki
[2]: https://github.com/NextCenturyCorporation/neon/wiki/Build-Instructions
[3]: https://github.com/NextCenturyCorporation/neon/wiki/Deploying-Neon
[4]: https://github.com/NextCenturyCorporation/neon/wiki/Developer-Quick-Start-Guide
[5]: http://neonframework.org
[6]: http://github.com/NextCenturyCorporation/neon
[7]: http://www.owfgoss.org
[8]: http://www.mongodb.org
[9]: http://spark.apache.org/
