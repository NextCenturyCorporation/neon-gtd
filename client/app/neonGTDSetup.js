'use strict';
/*
 * Copyright 2016 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var XDATA = {};

var VISUALIZATIONS = neonVisualizations || [];

/*
 * NeonGTDSetup collects a number of helper functions used to setup the single page Neon GTD app and the OWF widgets that
 * break NeonGTD into individual OWF-compliant widgets.
 * @class neonDemo.services.ConnectionService
 * @constructor
 */
var NeonGTDSetup = {};
NeonGTDSetup = (function() {
    var NeonGTDSetup = function(angularApp) {
        this.angularApp = angularApp;
    };

    NeonGTDSetup.prototype.createExternalService = function(args, argsMappings) {
        var service = {
            apps: {},
            args: []
        };

        args.forEach(function(argName) {
            service.args.push({
                variable: argName,
                mappings: argsMappings[argName]
            });
        });

        return service;
    };

    /**
     * @example of external.services
     *  {
     *      user: {
     *          apps: {
     *              App1: {
     *                  image: file_path,
     *                  url: app/{{userVariable}}
     *              }
     *          },
     *          args: [{
     *              variable: userVariable,
     *              mappings: neonUserMapping
     *          }]
     *      },
     *      bounds: {
     *          apps: {
     *              App2: {
     *                  image: file_path,
     *                  url: app/?bounds={{boundsVariable.min_lat}},{{boundsVariable.min_lon}},{{boundsVariable.max_lat}},{{boundsVariable.max_lon}}
     *              }
     *          },
     *          args: [{
     *              variable: boundsVariable,
     *              mappings: {
     *                  min_lat: neonMinLatMapping,
     *                  min_lon: neonMinLonMapping,
     *                  max_lat: neonMaxLatMapping,
     *                  max_lat: neonMaxLonMapping
     *              }
     *          }]
     *      }
     *  }
     */
    NeonGTDSetup.prototype.readAndSaveExternalServices = function(config, callback) {
        var me = this;
        var saveExternalServicesAndRunCallback = function(services) {
            me.saveExternal(services);
            if(callback) {
                callback();
            }
        };

        if(!(config.configList && config.configList.length && config.servicesMappings && config.argsMappings)) {
            saveExternalServicesAndRunCallback({});
            return;
        }

        var services = {};
        var urlProperty = (config.fileProperties ? config.fileProperties.url : undefined) || "url";
        var nameProperty = (config.fileProperties ? config.fileProperties.name : undefined) || "name";
        var imageProperty = (config.fileProperties ? config.fileProperties.image : undefined) || "image";
        var servicesProperty = (config.fileProperties ? config.fileProperties.services : undefined) || "services";

        var readConfigCallback = function(configList) {
            if(configList.length) {
                readConfig(configList);
            } else {
                saveExternalServicesAndRunCallback(services);
            }
        };

        // http://stackoverflow.com/questions/17192796/generate-all-combinations-from-multiple-lists
        var generatePermutations = function(lists, result, depth, current) {
            if(depth === lists.length) {
                result.push(angular.copy(current));
                return;
            }

            for(var i = 0; i < lists[depth].length; ++i) {
                generatePermutations(lists, result, depth + 1, current.concat([lists[depth][i]]));
            }
        };

        var createServices = function(data, appType, serviceType) {
            var neonServiceMappings = [];
            Object.keys(config.servicesMappings).forEach(function(neonServiceMapping) {
                if(serviceType === config.servicesMappings[neonServiceMapping]) {
                    neonServiceMappings.push(neonServiceMapping);
                } else if(serviceType.indexOf(config.servicesMappings[neonServiceMapping]) >= 0) {
                    // Create a neon service mapping for the the multiple-service mapping (like "bounds,date,user") by combining the neon service configuration for each subservice.
                    var subserviceTypes = serviceType.split(",");
                    var neonSubservicesMappingsList = [];
                    var failure = false;

                    subserviceTypes.forEach(function(subserviceType) {
                        var neonSubservicesMappings = [];
                        Object.keys(config.servicesMappings).forEach(function(otherNeonServiceMapping) {
                            if(subserviceType === config.servicesMappings[otherNeonServiceMapping]) {
                                neonSubservicesMappings.push(otherNeonServiceMapping);
                            }
                        });
                        neonSubservicesMappingsList.push(neonSubservicesMappings);
                        failure = failure || !neonSubservicesMappings.length;
                    });

                    if(!failure) {
                        var neonMultipleServicesMappingsLists = [];
                        generatePermutations(neonSubservicesMappingsList, neonMultipleServicesMappingsLists, 0, []);
                        neonMultipleServicesMappingsLists.forEach(function(neonMultipleServicesMappingList) {
                            var neonMultipleServicesMapping = neonMultipleServicesMappingList.sort().join(",");
                            if(neonServiceMappings.indexOf(neonMultipleServicesMapping) < 0) {
                                neonServiceMappings.push(neonMultipleServicesMapping);
                            }
                        });
                    }
                }
            });

            var appName = data[appType][nameProperty];

            // Ignore linking to the Neon Dashboard itself.
            if(appName.toLowerCase().indexOf("neon") !== 0) {
                neonServiceMappings.forEach(function(neonServiceMapping) {
                    var argsMappings = config.argsMappings[neonServiceMapping];
                    if(!argsMappings) {
                        argsMappings = {};
                        // Create an arg mapping for the the multiple-service mapping (like "bounds,date,user") by combining the neon arg mapping configuration for each subservice.
                        neonServiceMapping.split(",").forEach(function(neonSubservicesMapping) {
                            var subservicesArgsMappings = config.argsMappings[neonSubservicesMapping];
                            Object.keys(subservicesArgsMappings).forEach(function(subserviceType) {
                                argsMappings[subserviceType] = subservicesArgsMappings[subserviceType];
                            });
                        });
                    }

                    services[neonServiceMapping] = services[neonServiceMapping] || this.createExternalService(serviceType.split(","), argsMappings);

                    services[neonServiceMapping].apps[appName] = {
                        image: (config.imageDirectory || ".") + "/" + data[appType][imageProperty],
                        url: data[appType][urlProperty] + "/" + data[appType][servicesProperty][serviceType]
                    };
                });
            }
        };

        var readConfig = function(configList) {
            $.ajax({
                url: configList.shift(),
                success: function(json) {
                    var data = _.isString(json) ? $.parseJSON(json) : json;
                    Object.keys(data).forEach(function(appType) {
                        Object.keys(data[appType][servicesProperty]).forEach(function(serviceType) {
                            createServices(data, appType, serviceType);
                        });
                    });
                    readConfigCallback(configList);
                },
                error: function() {
                    readConfigCallback(configList);
                }
            });
        };

        readConfig(config.configList);
    };

    NeonGTDSetup.prototype.saveLayouts = function(layouts) {
        Object.keys(layouts).forEach(function(layout) {
            layouts[layout].forEach(function(visualization) {
                var visualizationConfig = _.find(VISUALIZATIONS, function(visualizationConfig) {
                    return visualizationConfig.type === visualization.type;
                });
                visualization.name = visualizationConfig.name;
                visualization.sizeX = visualization.sizeX || visualizationConfig.sizeX;
                visualization.sizeY = visualization.sizeY || visualizationConfig.sizeY;
                visualization.minSizeX = visualization.minSizeX || visualizationConfig.minSizeX;
                visualization.minSizeY = visualization.minSizeY || visualizationConfig.minSizeY;
                visualization.minPixelX = visualization.minPixelX || visualizationConfig.minPixelX;
                visualization.minPixelY = visualization.minPixelY || visualizationConfig.minPixelY;
            });
        });

        neonDemo.constant('layouts', layouts);
    };

    NeonGTDSetup.prototype.readLayoutFilesAndSaveLayouts = function($http, layouts, layoutFiles, callback) {
        var me = this;
        if(layoutFiles.length) {
            var layoutFile = layoutFiles.shift();
            $http.get(layoutFile).then(function(response) {
                var layoutConfig = layoutFile.substring(layoutFile.length - 4) === "yaml" ? jsyaml.load(response.data) : response.data;
                if(layoutConfig.name && layoutConfig.layout) {
                    layouts[layoutConfig.name] = layoutConfig.layout;
                }
                me.readLayoutFilesAndSaveLayouts($http, layouts, layoutFiles, callback);
            }, function() {
                me.readLayoutFilesAndSaveLayouts($http, layouts, layoutFiles, callback);
            });
        } else {
            this.saveLayouts(layouts);
            if(callback) {
                callback();
            }
        }
    };

    NeonGTDSetup.prototype.saveDatasets = function(datasets) {
        this.angularApp.value('datasets', datasets);
    };

    NeonGTDSetup.prototype.readDatasetFilesAndSaveDatasets = function($http, datasets, datasetFiles, callback) {
        var me = this;
        if(datasetFiles.length) {
            var datasetFile = datasetFiles.shift();
            $http.get(datasetFile).then(function(response) {
                var datasetConfig = datasetFile.substring(datasetFile.length - 4) === "yaml" ? jsyaml.load(response.data) : response.data;
                if(datasetConfig.dataset) {
                    datasets.push(datasetConfig.dataset);
                }
                me.readDatasetFilesAndSaveDatasets($http, datasets, datasetFiles, callback);
            }, function() {
                me.readDatasetFilesAndSaveDatasets($http, datasets, datasetFiles, callback);
            });
        } else {
            this.saveDatasets(datasets);
            if(callback) {
                callback();
            }
        }
    };

    NeonGTDSetup.prototype.saveUserAle = function(config) {
        // Configure the user-ale logger.
        var aleConfig = (config.user_ale || {
            loggingUrl: "http://192.168.1.100",
            toolName: "Neon Dashboard",
            elementGroups: [
                "top",
                "map_group",
                "table_group",
                "chart_group",
                "query_group",
                "graph_group"
            ],
            workerUrl: "bower_components/user-ale/helper-libs/javascript/userale-worker.js",
            debug: false,
            sendLogs: false
        });
        XDATA.userALE = new userale(aleConfig);
        XDATA.userALE.register();
        // Disable user ale log polling or widget demos.
        clearInterval(timerId);
    };

    NeonGTDSetup.prototype.saveOpenCpu = function(config) {
        var opencpuConfig = (config.opencpu || {
            enableOpenCpu: false
        });
        if(opencpuConfig.enableOpenCpu) {
            ocpu.enableLogging = opencpuConfig.enableLogging;
            ocpu.useAlerts = opencpuConfig.useAlerts;
            ocpu.seturl(opencpuConfig.url);
            ocpu.connected = true;
        }
        this.angularApp.constant('opencpu', opencpuConfig);
    };

    NeonGTDSetup.prototype.saveDashboards = function(config) {
        var helpConfig = (config.help || {
            guide: undefined,
            webVideo: undefined,
            localVideo: undefined
        });
        var dashboardConfig = config.dashboard || {
            hideNavbarItems: false,
            hideAddVisualizationsButton: false,
            hideAdvancedOptions: false,
            hideErrorNotifications: false,
            hideHeader: false,
            showImport: false,
            showExport: true
        };

        dashboardConfig.theme = config.theme;
        dashboardConfig.gridsterColumns = dashboardConfig.gridsterColumns || 24;
        dashboardConfig.gridsterMargins = dashboardConfig.gridsterMargins || 10;
        dashboardConfig.help = helpConfig;
        dashboardConfig.showExport = (dashboardConfig.showExport === undefined || dashboardConfig.showExport) ? true : false;
        this.angularApp.constant('config', dashboardConfig);

        // Keep the autoplay video code here because when it was in the neonDemoController the dashboard would start playing the video whenever the dataset was changed.
        if(dashboardConfig.showVideoOnLoad && dashboardConfig.help.localVideo) {
            neon.ready(function() {
                $("#videoModal").modal("show");
                $("#helpVideo").attr("autoplay", "");
            });
        }

        (config.visualizations || []).forEach(function(visualization) {
            var index = _.findIndex(VISUALIZATIONS, {
                type: visualization.type
            });
            if(index < 0) {
                VISUALIZATIONS.push(visualization);
            } else if(visualization.exclude) {
                VISUALIZATIONS.splice(index, 1);
            } else {
                VISUALIZATIONS[index] = visualization;
            }
        });

        // Note that minimum sizes of visualizations will be updated automatically in the main controller whenever gridster is resized or new visualizations are added to the layout.
        VISUALIZATIONS.forEach(function(visualization) {
            visualization.sizeX = visualization.sizeX || Math.floor(dashboardConfig.gridsterColumns * 0.25);
            visualization.sizeY = visualization.sizeY || Math.floor(dashboardConfig.gridsterColumns * 0.20);
            visualization.minPixelX = visualization.minPixelX || neonVisualizationMinPixel.x;
            visualization.minPixelY = visualization.minPixelY || neonVisualizationMinPixel.y;
            visualization.minSizeX = 1;
            visualization.minSizeY = 1;
        });

        neonDemo.constant('visualizations', VISUALIZATIONS);
    };

    NeonGTDSetup.prototype.saveVisualizations = function(config) {
        var visualizations = (config.visualizations || []);
        this.angularApp.constant('visualizations', visualizations);
    };

    NeonGTDSetup.prototype.saveExternal = function(services) {
        this.angularApp.constant('external', {
            active: Object.keys(services).length,
            services: services
        });
    };

    return NeonGTDSetup;
})();
