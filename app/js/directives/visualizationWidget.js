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
angular.module('visualizationWidgetDirective', [])
    .directive('visualizationWidget', function($compile) {

    return {
        restrict: 'A',
        scope: {
            gridsterConfig: "="
        },
        template: '<div class="visualization-drag-handle"></div>',
        link: function($scope, $elem, $attrs) {
            // Create out widget.  Here, we are assuming the visualization is 
            // implementated as an attribute directive.
            var widgetElement = document.createElement("div");
            widgetElement.setAttribute($scope.gridsterConfig.type, "");

            // Pass along any bindings.
            if ($scope.gridsterConfig && $scope.gridsterConfig.bindings) {
                var bindings = $scope.gridsterConfig.bindings;
                for (var prop in bindings) {
                    if (bindings.hasOwnProperty(prop)) {
                        widgetElement.setAttribute(prop, bindings[prop]);
                    }
                }
            }

            $elem.append($compile(widgetElement)($scope));

            var onVisualizationChange = function() {
                console.log($scope.gridsterConfig.type + " changed");
            };

            $scope.$watch(["bindings", "visualization"], onVisualizationChange, true);

            $scope.$watch('gridsterConfig.position[0]', function() {
                console.log($scope.gridsterConfig.type + " repositioned");
            }, true);

            $scope.$watch('gridsterConfig.size.x', function() {
                console.log($scope.gridsterConfig.type + " resized");
            }, true);
        }
    };
});
