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

// Defaulting the Neon SERVER_URL to be under the neon context on the same host machine.
// Used by neon core server.  Don't delete this or you will probably break everything!
neon.SERVER_URL = "/neon";

// TODO Remove safeApply because it is a bad practice.
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

neon.helpers = {
    /**
     * Finds and returns the field value in data. If field contains '.', representing that the field is in an object within data, it will
     * find the nested field value.
     * @param {Object} data
     * @param {String} field
     * @method getNestedValue
     */
    getNestedValue: function(data, field) {
        var fieldArray = field.split(".");
        var dataValue = data;
        fieldArray.forEach(function(field) {
            if(dataValue) {
                dataValue = dataValue[field];
            }
        });
        return dataValue;
    },
    /**
     * Escapes all values in the given data, recursively.
     * @param {Object|Array} data
     * @method escapeDataRecursively
     */
    escapeDataRecursively: function(data) {
        if(_.isArray(data)) {
            for(var i = 0; i < data.length; i++) {
                data[i] = neon.helpers.escapeDataRecursively(data[i]);
            }
        } else if(_.keys(data).length) {
            var keys = _.keys(data);
            for(var i = 0; i < keys.length; i++) {
                data[keys[i]] = neon.helpers.escapeDataRecursively(data[keys[i]]);
            }
        } else if(_.isString(data)) {
            data = _.escape(data);
        }
        return data;
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
    'linkify',

    'agGrid',

    'gantt',
    'gantt.tooltips',
    'gantt.tree',
    'gantt.groups'
]);

neonDemo.config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
    $routeProvider.when('/', {
        templateUrl: 'index.html',
        controller: 'neonDemoController'
    });
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });
}]);

// AngularJS filter for reversing the order of an array.
// http://stackoverflow.com/questions/15266671/angular-ng-repeat-in-reverse
neonDemo.filter("reverse", function() {
    return function(items) {
        return items ? items.slice().reverse() : items;
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
    angular.bootstrap(document, ['neonDemo'], {
        // Throws errors if angular code will not work correctly once minified.
        strictDi: true
    });
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
        workerUrl: "bower_components/user-ale/helper-libs/javascript/userale-worker.js",
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
    neonDemo.constant('config', dashboardConfig);

    // Keep the autoplay video code here because when it was in the neonDemoController the dashboard would start playing the video whenever the dataset was changed.
    if(dashboardConfig.showVideoOnLoad && dashboardConfig.help.localVideo) {
        neon.ready(function() {
            $("#videoModal").modal("show");
            $("#helpVideo").attr("autoplay", "");
        });
    }

    var visualizations = neonVisualizations || [];
    var overrides = config.visualizations || [];

    overrides.forEach(function(override) {
        var index = _.findIndex(visualizations, {
            type: override.type
        });
        if(index < 0) {
            visualizations.push(override);
        } else {
            visualizations[index] = override;
        }
    });

    // Most visualizations should have a minimum size of about 300px square to have space for their UI elements.
    // TODO Use the browser width to determine the minimum size for visualizations and update it on browser resize.
    visualizations.forEach(function(visualization) {
        visualization.sizeX = visualization.sizeX || Math.floor(dashboardConfig.gridsterColumns * visualization.minSizePercentageX);
        visualization.sizeY = visualization.sizeY || Math.floor(dashboardConfig.gridsterColumns * visualization.minSizePercentageY);
        visualization.minSizeX = Math.floor(dashboardConfig.gridsterColumns * visualization.minSizePercentageX);
        visualization.minSizeY = Math.floor(dashboardConfig.gridsterColumns * visualization.minSizePercentageY);
    });

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
        if(!(appName.toLowerCase().indexOf("neon") === 0)) {
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

                services[neonServiceMapping] = services[neonServiceMapping] || createExternalService(serviceType.split(","), argsMappings);

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
    $http.get("./app/config/config.yaml").then(function(response) {
        saveNeonConfig($http, jsyaml.load(response.data));
    }, function() {
        $http.get("./app/config/config.json").then(function(response) {
            saveNeonConfig($http, response.data);
        });
    });
});
