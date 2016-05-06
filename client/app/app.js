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

// Start angular once all of the configuration variables have been read from the JSON file(s) and set in the module.
var startAngular = function() {
    angular.bootstrap(document, ['neonDemo'], {
        // Throws errors if angular code will not work correctly once minified.
        strictDi: true
    });
};

var NeonGTDSetup = new NeonGTDSetup(neonDemo);

var saveNeonConfig = function($http, config) {
    NeonGTDSetup.saveUserAle(config);
    NeonGTDSetup.saveOpenCpu(config);
    NeonGTDSetup.saveDashboards(config);

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
    var $http = angular.injector(['ng']).get('$http');
    $http.get("./app/config/config.yaml").then(function(response) {
        saveNeonConfig($http, jsyaml.load(response.data));
    }, function() {
        $http.get("./app/config/config.json").then(function(response) {
            saveNeonConfig($http, response.data);
        });
    });
});
