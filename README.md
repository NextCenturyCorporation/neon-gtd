#Neon Geo Temporal Dashboard
The Neon Geo Temporal Dashboard (neon-gtd) is a sample analysis dashboard built upon the [Neon Framework][5]. It includes a number of geo-spatial and temporal data visualizations built as [AngularJS][13] directives that use the Neon framework to query and filter data served by [MongoDB][8], [Elasticsearch 1.7][14] or an [Apache Spark][9] server. 

[Neon][5] is a software platform designed to help developers integrate disparate visualization widgets with your data stores. It includes a **Data Access API** that makes it easy to query an underlying database directly from JavaScript or RESTful endpoints. Additionally, the [Neon][5] **Interaction API** provides capabilities for inter-widget communication and shared data filters, allowing multiple visualizations to interact without being explicityly aware of one another.

## View an example application
To see an example of this project, check out our [demo server](http://demo.neonframework.org/neon-gtd/app/#). Read more about how to use it and how it interacts with Neon [here][neon-gtd-guide].

## Build and run the example
Building the **neon-gtd** application requires [npm][10], [grunt][11], and [bower][12]. Running the application requires a functioning Neon deployment.  Links to the Neon deployment instructions and the command line instructions to build **neon-gtd** follow:

1. [Build and Deploy a Neon server][2] or simply drop the [latest neon.war](https://s3.amazonaws.com/neonframework.org/neon/versions/latest/neon.war) in a web application container such as [Tomcat](http://tomcat.apache.org/).

2. Clone the neon-gtd repo

        git clone https://github.com/NextCenturyCorporation/neon-gtd.git
        cd neon-gtd/
        
3. Copy the sample NEON-GTD configuration file to the app config folder or supply your own.  The configuration file specifies the default datasets and visualizations to display.  It is described in detail [here][15].  The sample configuration file is setup for the sample earthquake data referenced in step 1.

        # Copy either the YAML or JSON config file.  If Neon-GTD cannot find one, 
        # it will look for the other.  
        cp app/config/sample.config.yaml app/config/config.yaml
        cp app/config/sample.config.json app/config/config.json

4. Use npm and grunt to download dependencies and build the application.  This will create a neon-gtd war file in  the **neon-gtd/target** directory.

        npm install
        grunt

5. Deploy the **neon-gtd-&lt;version&gt;.war** file to your container from step 1.
    Note: On Tomcat, this may be as simple as copying the file to your <apache-tomcat>/webapps folder.  Optionally, you may want to rename the war file to be simply neon-gtd.war.

5. If running against a stock, localhost Tomcat instance, browse to the [http://localhost:8080/neon-gtd/app/][neon-gtd-localhost] to verify its installation.  The [Users Guide][neon-gtd-guide] describes its basic use.

[neon-gtd-localhost]: http://localhost:8080/neon-gtd/app/
[neon-gtd-guide]: https://github.com/NextCenturyCorporation/neon-gtd/wiki/Neon-GTD-User-Guide

##Documentation

**[Neon Git Repo][6]** - Visit the main Neon project and download its source code.

**[Neon Wiki][1]** - Visit the Neon wiki for more information on what Neon can do for you.

**[Build Instructions][2]** - Includes instructions for building the Neon WAR file from source code and lists Neon's external dependencies.

**[Deploying Neon][3]** - Includes instructions for deploying the Neon application to a web application container (e.g., Jetty or Tomcat).

**[Developer Quick Start Guide][4]** - A quick tour of how to develop apps that use Neon.

## Additional Information

Email: neon-support@nextcentury.com

Website: [http://neonframework.org][5]

Copyright 2014 Next Century Corporation

[1]: https://github.com/NextCenturyCorporation/neon/wiki
[2]: https://github.com/NextCenturyCorporation/neon/wiki/Build-Instructions
[3]: https://github.com/NextCenturyCorporation/neon/wiki/Deploying-Neon
[4]: https://github.com/NextCenturyCorporation/neon#quick-start-build-and-run-the-example
[5]: http://neonframework.org
[6]: http://github.com/NextCenturyCorporation/neon
[7]: http://www.owfgoss.org
[8]: http://www.mongodb.org
[9]: http://spark.apache.org/
[10]: https://www.npmjs.org/
[11]: http://gruntjs.com/
[12]: http://bower.io/
[13]: https://angularjs.org/
[14]: https://www.elastic.co/products/elasticsearch
[15]: https://github.com/NextCenturyCorporation/neon-gtd/wiki/Neon-Dashboard-Configuration-Guide
