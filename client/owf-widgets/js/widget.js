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

var neonDemo = angular.module('neonDemo', WidgetConfig.demoModuleList);

neonDemo.config(["$routeProvider", "$locationProvider", function($routeProvider, $locationProvider) {
    $routeProvider.when('/', {
        templateUrl: WidgetConfig.templateURL,
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
angular.module('neonDemo.controllers')
.controller('neonDemoController', ['$scope', '$compile', '$timeout', '$location', 'config', 'layouts', 'datasets', 'ThemeService', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'VisualizationService', 'widgetState',
function($scope, $compile, $timeout, $location, config, layouts, datasets, themeService, connectionService, datasetService, errorNotificationService, visualizationService, widgetState) {
    $scope.messenger = new neon.eventing.Messenger();

    themeService.setTheme(WidgetConfig.theme);
    $scope.theme = {
        list: themeService.getThemes(),
        selected: themeService.getTheme()
    };

    $scope.updateTheme = function() {
        themeService.setTheme($scope.theme.selected.name);
    };

    $scope.hideNavbarItems = config.hideNavbarItems;
    $scope.hideFilterStatusTray = config.hideFilterStatusTray;

    $scope.hideAddVisualizationsButton = false;
    $scope.hideAdvancedOptions = false;
    $scope.element = $("body");

    $scope.element = $(window);
    $scope.visualizationId = OWF.getInstanceId();

    // Load and connect to the first dataset for now.
    // TODO: Need a way to handle switching datasets.
    $scope.bindings = widgetState || {};
    $scope.bindings.hideAdvancedOptions = config.hideAdvancedOptions;
    $scope.bindings.hideHeader = config.hideHeader;

    datasetService.setActiveDataset(datasets[0]);
    connectionService.createActiveConnection(datasets[0].datastore, datasets[0].hostname);

    // Create a helper function to build the widget's visualization directive from the WidgetConfig object.
    // TODO:  For now, this duplicates a method in visualizationWidget component used in the single page
    // Neon-GTD application.  
    var addWidgetElement = function() {
        var widgetContainer = document.getElementsByClassName("visualization-widget");
        var widget = document.createElement('div');
        
        var implementation = WidgetConfig.type === "lineChart" || WidgetConfig.type === "map" ? "multipleLayer" : "singleLayer";
        var superclassType = WidgetConfig.type === "filterBuilder" ? "filter-builder" : "visualization-superclass";
        widget.setAttribute(superclassType, "");
        widget.setAttribute("implementation", implementation);
        widget.setAttribute("name", WidgetConfig.name);
        widget.setAttribute("type", WidgetConfig.type);
        widget.setAttribute("state-id", WidgetConfig.type + "-" + OWF.getInstanceId());
        widget.setAttribute("visualization-id", WidgetConfig.type + "-" + OWF.getInstanceId());
        widget.setAttribute("log-element-group", WidgetConfig.logElementGroup);
        widget.setAttribute("log-element-type", WidgetConfig.logElementType);

        // TODO Add to visualization configuration.
        if(WidgetConfig.type === "filterBuilder") {
            widget.setAttribute("update-menus", "updateFilterBuilderMenus");
        }
        widget.setAttribute("bindings", "bindings");
        $(widgetContainer[0]).append($compile(widget)($scope));
    };

    if(WidgetConfig.loadingFilterBuilder) {
        addWidgetElement();
        datasetService.updateDatabases(datasets[0], connectionService.getActiveConnection(), function(dataset) {
            $scope.$apply(function(dataset) {
                datasets[0] = dataset;
                if ($scope.updateFilterBuilderMenus) {
                    $scope.updateFilterBuilderMenus();
                }
                ;
            });
            
        }, 0);
    } else {
        datasetService.updateDatabases(datasets[0], connectionService.getActiveConnection(), function(dataset) {
            $scope.$apply(function(dataset) {
                datasets[0] = dataset;
                addWidgetElement();
            });
        }, 0);
    }

    // Watch for changes to our visualization's configuration and store them as OWF prefs.
    $scope.$watch(function() {
        var widgets = visualizationService.getWidgets();
        if (widgets.length == 1) {
            return widgets[0].callback();
        }
        return undefined;
    }, function(newVal) {
        if (newVal) {
            OWF.Preferences.setUserPreference({
                'namespace': WidgetConfig.namespace + '.' + OWF.getInstanceId(),
                'name': 'Neon Preferences',
                'value': JSON.stringify(newVal),
                'onSuccess': function (msg) {
                 },
                'onFailure': function (msg) {
                }
            });
        }
    }, true);
}]);

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
    // Disable user ale log polling or widget demos.
    clearInterval(timerId)
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
    dashboardConfig.help = helpConfig;
    dashboardConfig.showExport = (dashboardConfig.showExport === undefined || dashboardConfig.showExport) ? true : false;
    neonDemo.constant('config', dashboardConfig);
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

var saveNeonConfig = function($http, config, widgetState) {
    saveUserAle(config);
    saveOpenCpu(config);
    saveDashboards(config);
    saveVisualizations(config);
    neonDemo.value('widgetState', widgetState);

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
    // Set any OWF Handlers and try to read our bindings from OWF Prefs 
    // before loading our angular app and generating our visualization.
    OWF.ready(function() {
        OWF.relayFile = 'assets/vendor/eventing/rpc_relay.uncompressed.html';

        // -----------------------------------
        // Hide the body when the widget is not visible.
        // -----------------------------------
        var eventMonitor = {};
        eventMonitor.widgetEventingController = Ozone.eventing.Widget.getInstance();

        eventMonitor.widgetState = Ozone.state.WidgetState.getInstance({
            widgetEventingController: eventMonitor.widgetEventingController,
            autoInit: true,
            onStateEventReceived: function(sender, msg) {
                var event = msg.eventName;

                if(event === 'activate' || event === 'show') {
                    $(document.body).css("visibility", "visible");
                }
                else if(event === 'hide') {
                    $(document.body).css("visibility", "hidden");
                } 
                else if(event === 'beforeclose') {
                    // Clean up our preferences when we are closed.
                    eventMonitor.widgetState.removeStateEventOverrides({
                        event: [event],
                        callback: function() {
                            OWF.Preferences.deleteUserPreference({
                                namespace: WidgetConfig.namespace + '.' + OWF.getInstanceId(),
                                name: 'Neon Preferences',
                                onSuccess: function (response) {
                                    eventMonitor.widgetState.closeWidget();
                                },
                                onFailure: function (response) {
                                    eventMonitor.widgetState.closeWidget();
                                }
                            });
                        }
                    });
                }
            }
        });

        // listen for  activate and hide events so that we can
        // hide our body.  Some browsers, specifically Chrome, continues
        // to render iframes with elments that use specific webkit transforms
        // even when they are hidden.  This impact many Map packages and some
        // SVG packages.  The work around for this is to hide our widget body
        // on hide events.
        eventMonitor.widgetState.addStateEventListeners({
            events: ['activate', 'hide', 'show']
        });

        // override beforeclose event so that we can clean up
        // widget state data
        eventMonitor.widgetState.addStateEventOverrides({
            events: ['beforeclose']
        });

        OWF.Preferences.getUserPreference({
            'namespace': WidgetConfig.namespace + '.' + OWF.getInstanceId(),
            'name': 'Neon Preferences',
            'onSuccess': function (msg) {
                var widgetState = msg.value ? JSON.parse(msg.value) : {};
                var $http = angular.injector(['ng']).get('$http');
                $http.get("./app/config/config.yaml").then(function(response) {
                    saveNeonConfig($http, jsyaml.load(response.data), widgetState);
                }, function() {
                    $http.get("./app/config/config.json").then(function(response) {
                        saveNeonConfig($http, response.data, widgetState);
                    });
                });
            }
        });

        OWF.notifyWidgetReady();
    });
    
});
