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
/*
 * Widget.js is a modified version of app.js from the Neon-GTD single-page application.  It 
 * has been altered in the following ways to accomodate multiple OWF Widgets based upon
 * Neon-GTD visualizations:
 * - Removal of references to unnecesssary components from the single page app (e.g., gridster)
 * - Addition of OWF event handles to support saving widget settings via OWF Preferences
 * - Pruning of functions required only by the single page application.
 * - Added to the event chain of actions required before the angular code of the widget starts to support OWF elements.
 */

// Setup OWF's preferences support.  OWF should be included prior to this file to setup the OWF namespaces.
owfdojo.config.dojoBlankHtmlUrl = 'assets/vendor/dojo-1.5.0-windowname-only/dojo/resources/blank.html';

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

angular.module('neonDemo.directives', []);
angular.module('neonDemo.controllers', []);
angular.module('neonDemo.services', []);

// AngularJS filter for reversing the order of an array.
// http://stackoverflow.com/questions/15266671/angular-ng-repeat-in-reverse
neonDemo.filter("reverse", function() {
    return function(items) {
        return items ? items.slice().reverse() : items;
    };
});

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

// Create the main controller for the application.
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
    // Clear the previous title so it can be determined on the fly as the user selects different databases.
    $scope.bindings.title = '';
    $scope.bindings.hideAdvancedOptions = config.hideAdvancedOptions;
    $scope.bindings.hideHeader = config.hideHeader;

    datasetService.setActiveDataset(datasets[0]);
    connectionService.createActiveConnection(datasets[0].datastore, datasets[0].hostname);

    // Setup some OWF event handlers to cover when the widget is hidden/shown/closed.
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
                // Destroy our widget explicitly so it cleans up any filters it was holding onto.
                $scope.$destroy();

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

    // Handle clearing our filters on a page refresh.
    $(window).bind("beforeunload", function(){
        $scope.$destroy();
    });

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


// Start angular once all of the configuration variables have been read from the JSON file(s) and set in the module.
var startAngular = function() {
    angular.bootstrap(document, ['neonDemo'], {
        // Throws errors if angular code will not work correctly once minified.
        strictDi: true
    });
};

var NeonGTDSetup = new NeonGTDSetup(neonDemo);

var saveNeonConfig = function($http, config, widgetState) {
    NeonGTDSetup.saveUserAle(config);
    NeonGTDSetup.saveOpenCpu(config);
    NeonGTDSetup.saveVisualizations(config);
    neonDemo.constant('config', config);
    neonDemo.value('widgetState', widgetState);

    var files = (config.files || []);
    var layouts = (config.layouts || {});
    if(!(layouts.default)) {
        layouts.default = [];
    }
    var datasets = (config.datasets || []);

    // Read the external application services config file and create the services, then read each layout config file and add the layouts,
    // then read each dataset config file and add the datasets, then start angular.
    NeonGTDSetup.readAndSaveExternalServices((config.externalServices || {}), function() {
        NeonGTDSetup.readLayoutFilesAndSaveLayouts($http, layouts, (files.layouts || []), function() {
            NeonGTDSetup.readDatasetFilesAndSaveDatasets($http, datasets, (files.datasets || []), startAngular);
        });
    });
};

angular.element(document).ready(function() {
    // Set any OWF Handlers and try to read our bindings from OWF Prefs 
    // before loading our angular app and generating our visualization.
    OWF.ready(function() {
        OWF.relayFile = 'assets/vendor/eventing/rpc_relay.uncompressed.html';

        // Pull our config files and any saved OWF preferences prior to kicking off the application.
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
