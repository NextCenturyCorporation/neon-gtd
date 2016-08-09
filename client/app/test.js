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

// Load modules for Jasmine tests without running the full app
var neonDemo = angular.module('neonDemo', [
    'neonDemo.controllers',
    'neonDemo.services',
    'neonDemo.directives',
    'neonDemo.filters',
    'agGrid',
    'ngDraggable',
    'ngRoute',
    'linkify'
]);

neonDemo.constant('customFilters', {});
neonDemo.constant('external', {
    active: 0,
    services: {}
});
neonDemo.value('datasets', []);

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

// Create the main controller for the application.
angular.module('neonDemo.controllers')
.controller('neonDemoController', ['$scope', '$compile', '$timeout', '$location', 'config', 'layouts', 'datasets', 'ThemeService', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'VisualizationService', 'widgetState',
function($scope) {
    $scope.theme = {};

    $scope.element = $("body");

    $scope.element = $(window);

    $scope.bindings = {};
}]);

// AngularJS filter for reversing the order of an array.
// http://stackoverflow.com/questions/15266671/angular-ng-repeat-in-reverse
neonDemo.filter("reverse", function() {
    return function(items) {
        return items ? items.slice().reverse() : items;
    };
});

// Create dummy logger
var XDATA = {};
XDATA.userALE = {
    log: function() {
    }
};

// Polyfill Function.bind() since it isn't available in PhantomJS until version 2.
if(!Function.prototype.bind) {
    Object.defineProperty(Function.prototype, "bind", {
        value: function(oThis) {
            if(typeof this !== 'function') {
                // closest thing possible to the ECMAScript 5
                // internal IsCallable function
                throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
            }

            var aArgs = Array.prototype.slice.call(arguments, 1);
            var fToBind = this;
            var FNOP = function() {};
            var fBound = function() {
                return fToBind.apply(this instanceof FNOP ? this : oThis, aArgs.concat(Array.prototype.slice.call(arguments)));
            };

            if(this.prototype) {
                // Function.prototype doesn't have a prototype property
                FNOP.prototype = this.prototype;
            }
            fBound.prototype = new FNOP();

            return fBound;
        }
    });
}

