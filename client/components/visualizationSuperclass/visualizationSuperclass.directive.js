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

angular.module('neonDemo.directives').directive('visualizationSuperclass', function() {
    return {
        templateUrl: 'components/visualizationSuperclass/visualizationSuperclass.html',
        scope: {
            bindings: '=',
            implementation: '@',
            logElementGroup: '@?',
            logElementType: '@?',
            name: '@',
            stateId: '@',
            type: '@',
            visualizationId: '@'
        },
        compile: function($element, $attrs) {
            // Must add angular attributes, controllers, and templates here before angular compiles the HTML for this directive.
            $element.find(".superclass-implementation").attr("ng-controller", $attrs.implementation + "Controller");
            $element.find(".visualization").attr("visualization-id", $attrs.visualizationId);
            $element.find(".visualization").attr("ng-controller", $attrs.type + "Controller");
            $element.find(".visualization-display").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Display.html'");
            $element.find(".visualization-headers").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Headers.html'");
            $element.find(".visualization-options").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Options.html'");
            $element.addClass("superclass");

            // Returns the angular directive link function.
            return function($scope, $element) {
                $scope.element = $element.find(".visualization");
            };
        },
        controller: "visualizationSuperclassController"
    };
});
