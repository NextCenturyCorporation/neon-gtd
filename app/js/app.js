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

var neonDemo = angular.module('neonDemo', [
    'neonDemo.controllers',
    'neonDemo.services',
    'neonDemo.directives',
    'neonDemo.filters',
    'gridster'
]);

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

angular.element(document).ready(function() {
    var $http = angular.injector(['ng']).get('$http');
    $http.get('./config/config.json').success(function(config) {
        var xdataConfig = (config.xdata || {
            echoToConsole: false,
            enableLogging: false,
            activityLoggerUrl: "",
            component: "",
            componentVersion: ""
        });

        XDATA.activityLogger = new activityLogger('lib/xdatalogger/js/draper.activity_worker-2.1.1.js');
        XDATA.activityLogger.echo(xdataConfig.echoToConsole).testing(!xdataConfig.enableLogging);
        XDATA.activityLogger.registerActivityLogger(xdataConfig.activityLoggerUrl, xdataConfig.component, xdataConfig.componentVersion);

        var opencpuConfig = (config.opencpu || {
            enableOpenCpu: false
        });

        if(opencpuConfig.enableOpenCpu) {
            ocpu.enableLogging = opencpuConfig.enableLogging;
            ocpu.useAlerts = opencpuConfig.useAlerts;
            ocpu.seturl(opencpuConfig.url);
        }

        var digConfig = (config.dig || {
            enabled: false
        });
        neonDemo.constant('DIG', digConfig);

        angular.bootstrap(document, ['neonDemo']);
    });
});
