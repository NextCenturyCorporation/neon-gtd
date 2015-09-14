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
    'ui.bootstrap.datetimepicker'
]);

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

var saveLayouts = function(layouts) {
    neonDemo.constant('layouts', layouts);
};

var readLayoutFiles = function($http, layouts, layoutFiles, callback) {
    if(layoutFiles.length) {
        var layoutFile = layoutFiles.shift();
        $http.get(layoutFile).success(function(layoutConfig) {
            if(layoutConfig.name && layoutConfig.layout) {
                layouts[layoutConfig.name] = layoutConfig.layout;
            }
            readLayoutFiles($http, layouts, layoutFiles, callback);
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

var readDatasetFiles = function($http, datasets, datasetFiles, callback) {
    if(datasetFiles.length) {
        var datasetFile = datasetFiles.shift();
        $http.get(datasetFile).success(function(datasetConfig) {
            if(datasetConfig.dataset) {
                datasets.push(datasetConfig.dataset);
            }
            readDatasetFiles($http, datasets, datasetFiles, callback);
        });
    } else {
        saveDatasets(datasets);
        if(callback) {
            callback();
        }
    }
};

angular.element(document).ready(function() {
    var $http = angular.injector(['ng']).get('$http');
    $http.get('./config/config.json').success(function(config) {
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
            showImport: false
        };
        dashboardConfig.gridsterColumns = dashboardConfig.gridsterColumns || 8;
        dashboardConfig.gridsterMargins = dashboardConfig.gridsterMargins || 10;
        // Most visualizations should have a minimum size of about 300px square to have space for their UI elements.
        // TODO Use the browser width to determine the minimum size for visualizations and update it on browser resize.
        dashboardConfig.gridsterDefaultMinSizeX = Math.floor(dashboardConfig.gridsterColumns / 4);
        dashboardConfig.gridsterDefaultMinSizeY = Math.floor(dashboardConfig.gridsterColumns / 6);
        dashboardConfig.help = helpConfig;
        neonDemo.constant('config', dashboardConfig);

        neonDemo.value('popups', {
            links: {
                setData: function() {},
                setView: function() {},
                deleteData: function() {}
            }
        });

        var digConfig = (config.dig || {
            enabled: false
        });
        var quickpinConfig = (config.quickpin || {
            enabled: false
        });
        var externalAppConfig = {
            anyEnabled: digConfig.enabled || quickpinConfig.enabled,
            dig: digConfig,
            quickpin: quickpinConfig
        };
        neonDemo.constant('external', externalAppConfig);

        var visualizations = (config.visualizations || []);
        neonDemo.constant('visualizations', visualizations);

        var files = (config.files || []);
        var layouts = (config.layouts || {});
        if(!(layouts.default)) {
            layouts.default = [];
        }
        var datasets = (config.datasets || []);

        // Read each layout config file and set the layouts, then read each dataset config file and set the datasets, then start angular.
        readLayoutFiles($http, layouts, (files.layouts || []), function() {
            readDatasetFiles($http, datasets, (files.datasets || []), startAngular);
        });

        // Keep the autoplay video code here because when it was in the neonDemoController the dashboard would start playing the video whenever the dataset was changed.
        if(dashboardConfig.showVideoOnLoad && dashboardConfig.help.video) {
            neon.ready(function() {
                $("#videoModal").modal("show");
                $("#helpVideo").attr("autoplay", "");
            });
        }
    });
});
