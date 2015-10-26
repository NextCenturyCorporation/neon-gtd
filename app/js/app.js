'use strict';
/*
 * Copyright 2014 Next Century Corporation
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

// Defaulting the Neon SERVER_URL to be under the neon context on the same host machine.
// Used by neon core server.  Don't delete this or you will probably break everything!
neon.SERVER_URL = "/neon";

/**
 * Utility that calls the given function in an $apply if the given $scope is not in the apply/digest phase or just calls the given function normally otherwise.
 * @param {Object} $scope The $scope of an angular directive.
 * @param {Fucntion} func The function to call.
 * @method safeApply
 */
neon.safeApply = function($scope, func) {
    if(!$scope || !func || typeof func !== "function") {
        return;
    }

    var phase = $scope.$root.$$phase;
    if(phase === "$apply" || phase === "$digest") {
        func();
    } else {
        $scope.$apply(func);
    }
};

var neonDemo = angular.module('neonDemo', [
    'neonDemo.controllers',
    'neonDemo.services',
    'neonDemo.directives',
    'neonDemo.filters',
    'gridster',
    'ngDraggable',
    'ngRoute',
    'ui.bootstrap.datetimepicker',

    'gantt',
    'gantt.tooltips',
    'gantt.tree',
    'gantt.groups'
]);

neonDemo.config(function($routeProvider, $locationProvider) {
    $routeProvider.when('/', {
        templateUrl: 'index.html',
        controller: 'neonDemoController'
    });
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });
});

// AngularJS filter for reversing the order of an array.
// http://stackoverflow.com/questions/15266671/angular-ng-repeat-in-reverse
neonDemo.filter("reverse", function() {
    return function(items) {
        return items.slice().reverse();
    };
});

angular.module('neonDemo.directives', []);
angular.module('neonDemo.controllers', []);
angular.module('neonDemo.services', []);

angular.module('neonDemo.filters', [])
.filter('numberShort', function() {
    return function(number) {
        if(typeof number !== undefined) {
            var abs = Math.abs(number);
            if(abs >= Math.pow(10, 12)) {
                number = (number / Math.pow(10, 12)).toFixed(1) + "T";
            } else if(abs < Math.pow(10, 12) && abs >= Math.pow(10, 9)) {
                number = (number / Math.pow(10, 9)).toFixed(1) + "B";
            } else if(abs < Math.pow(10, 9) && abs >= Math.pow(10, 6)) {
                number = (number / Math.pow(10, 6)).toFixed(1) + "M";
            } else if(abs < Math.pow(10, 6) && abs >= Math.pow(10, 3)) {
                number = (number / Math.pow(10, 3)).toFixed(1) + "K";
            } else {
                number = Math.round(number * 100) / 100;
            }
        }
        return number;
    };
});

var XDATA = {};

// Start angular once all of the configuration variables have been read from the JSON file(s) and set in the module.
var startAngular = function() {
    angular.bootstrap(document, ['neonDemo']);
};

var saveUserAle = function(config) {
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
        workerUrl: "lib/user-ale/js/userale-worker.js",
        debug: false,
        sendLogs: false
    });
    XDATA.userALE = new userale(aleConfig);
    XDATA.userALE.register();
};

var saveOpenCpu = function(config) {
    var opencpuConfig = (config.opencpu || {
        enableOpenCpu: false
    });
    if(opencpuConfig.enableOpenCpu) {
        ocpu.enableLogging = opencpuConfig.enableLogging;
        ocpu.useAlerts = opencpuConfig.useAlerts;
        ocpu.seturl(opencpuConfig.url);
        ocpu.connected = true;
    }
    neonDemo.constant('opencpu', opencpuConfig);
};

var saveDashboards = function(config) {
    var helpConfig = (config.help || {
        guide: undefined,
        video: undefined
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
    dashboardConfig.gridsterColumns = dashboardConfig.gridsterColumns || 8;
    dashboardConfig.gridsterMargins = dashboardConfig.gridsterMargins || 10;
    // Most visualizations should have a minimum size of about 300px square to have space for their UI elements.
    // TODO Use the browser width to determine the minimum size for visualizations and update it on browser resize.
    dashboardConfig.gridsterDefaultMinSizeX = Math.floor(dashboardConfig.gridsterColumns / 4);
    dashboardConfig.gridsterDefaultMinSizeY = Math.floor(dashboardConfig.gridsterColumns / 6);
    dashboardConfig.help = helpConfig;
    dashboardConfig.showExport = (dashboardConfig.showExport === undefined || dashboardConfig.showExport) ? true : false;
    neonDemo.constant('config', dashboardConfig);

    // Keep the autoplay video code here because when it was in the neonDemoController the dashboard would start playing the video whenever the dataset was changed.
    if(dashboardConfig.showVideoOnLoad && dashboardConfig.help.video) {
        neon.ready(function() {
            $("#videoModal").modal("show");
            $("#helpVideo").attr("autoplay", "");
        });
    }
};

var saveVisualizations = function(config) {
    var visualizations = (config.visualizations || []);
    neonDemo.constant('visualizations', visualizations);
};

var createExternalService = function(args, argsMappings) {
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

var saveExternal = function(services) {
    neonDemo.constant('external', {
        active: Object.keys(services).length,
        services: services
    });
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
var readAndSaveExternalServices = function(config, callback) {
    var saveExternalServicesAndRunCallback = function(services) {
        saveExternal(services);
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

    var readConfig = function(configList) {
        $.ajax({
            url: configList.shift(),
            success: function(json) {
                var data = _.isString(json) ? $.parseJSON(json) : json;
                Object.keys(data).forEach(function(appType) {
                    Object.keys(data[appType][servicesProperty]).forEach(function(serviceType) {
                        var neonServiceMappings = Object.keys(config.servicesMappings).filter(function(neonServiceMapping) {
                            return config.servicesMappings[neonServiceMapping] === serviceType;
                        });

                        neonServiceMappings.forEach(function(neonServiceMapping) {
                            services[neonServiceMapping] = services[neonServiceMapping] || createExternalService(serviceType.split(","), config.argsMappings[neonServiceMapping]);

                            services[neonServiceMapping].apps[data[appType][nameProperty]] = {
                                image: (config.imageDirectory || ".") + "/" + data[appType][imageProperty],
                                url: data[appType][urlProperty] + "/" + data[appType][servicesProperty][serviceType]
                            };
                        });
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

var saveLayouts = function(layouts) {
    neonDemo.constant('layouts', layouts);
};

var readLayoutFilesAndSaveLayouts = function($http, layouts, layoutFiles, callback) {
    if(layoutFiles.length) {
        var layoutFile = layoutFiles.shift();
        $http.get(layoutFile).then(function(response) {
            var layoutConfig = layoutFile.substring(layoutFile.length - 4) === "yaml" ? jsyaml.load(response.data) : response.data;
            if(layoutConfig.name && layoutConfig.layout) {
                layouts[layoutConfig.name] = layoutConfig.layout;
            }
            readLayoutFilesAndSaveLayouts($http, layouts, layoutFiles, callback);
        }, function(response) {
            readLayoutFilesAndSaveLayouts($http, layouts, layoutFiles, callback);
        });
    } else {
        saveLayouts(layouts);
        if(callback) {
            callback();
        }
    }
};

var saveDatasets = function(datasets) {
    neonDemo.value('datasets', datasets);
};

var readDatasetFilesAndSaveDatasets = function($http, datasets, datasetFiles, callback) {
    if(datasetFiles.length) {
        var datasetFile = datasetFiles.shift();
        $http.get(datasetFile).then(function(response) {
            var datasetConfig = datasetFile.substring(datasetFile.length - 4) === "yaml" ? jsyaml.load(response.data) : response.data;
            if(datasetConfig.dataset) {
                datasets.push(datasetConfig.dataset);
            }
            readDatasetFilesAndSaveDatasets($http, datasets, datasetFiles, callback);
        }, function(response) {
            readDatasetFilesAndSaveDatasets($http, datasets, datasetFiles, callback);
        });
    } else {
        saveDatasets(datasets);
        if(callback) {
            callback();
        }
    }
};

var saveNeonConfig = function($http, config) {
    saveUserAle(config);
    saveOpenCpu(config);
    saveDashboards(config);
    saveVisualizations(config);

    var files = (config.files || []);
    var layouts = (config.layouts || {});
    if(!(layouts.default)) {
        layouts.default = [];
    }
    var datasets = (config.datasets || []);

    // Read the external application services config file and create the services, then read each layout config file and add the layouts,
    // then read each dataset config file and add the datasets, then start angular.
    readAndSaveExternalServices((config.externalServices || {}), function() {
        readLayoutFilesAndSaveLayouts($http, layouts, (files.layouts || []), function() {
            readDatasetFilesAndSaveDatasets($http, datasets, (files.datasets || []), startAngular);
        });
    });
};

angular.element(document).ready(function() {
    var $http = angular.injector(['ng']).get('$http');
    $http.get("./config/config.yaml").then(function(response) {
        saveNeonConfig($http, jsyaml.load(response.data));
    }, function() {
        $http.get("./config/config.json").then(function(response) {
            saveNeonConfig($http, response.data);
        });
    });
});
