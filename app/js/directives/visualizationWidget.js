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

 /**
 * This Angular JS directive adds a basic widget that contain Neon visualizations.  Widgets are
 * defined by an Angular Gridster configuration object and include resize handlers, a resize bar,
 * and a simple icon for expanding to a max column/row size.
 * @example
 *    &lt;div visualization-widget gridsterConfig="item[i]"&gt;&lt;/div&gt;
 *
 * @class neonDemo.directives.visulizationWidget
 * @constructor
 */
angular.module('visualizationWidgetDirective', []).directive('visualizationWidget', function($compile) {
    var MAXIMIZED_COLUMN_SIZE = 6;
    var MAXIMIZED_ROW_SIZE = 4;

    return {
        restrict: 'A',
        scope: {
            gridsterConfig: "="
        },
        template: '<div class="visualization-drag-handle">' +
                '<button type="button" class="btn pull-right" ng-click="toggleSize()">' +
                '   <span  class="glyphicon" ng-class="(oldSize) ? \'glyphicon-resize-small\' : \'glyphicon-resize-full\'"></span>' +
                '</button>' +
            '</div>',
        link: function($scope, $element) {
            // Create out widget.  Here, we are assuming the visualization is
            // implementated as an attribute directive.
            var widgetElement = document.createElement("div");
            widgetElement.setAttribute($scope.gridsterConfig.type, "");

            // Pass along any bindings.
            if($scope.gridsterConfig && $scope.gridsterConfig.bindings) {
                var bindings = $scope.gridsterConfig.bindings;
                for(var prop in bindings) {
                    if(bindings.hasOwnProperty(prop)) {
                        widgetElement.setAttribute(prop, bindings[prop]);
                    }
                }
            }

            $element.append($compile(widgetElement)($scope));

            /**
             * Toggles the visualization widget between default and maximized views.
             * @method onDatasetChanged
             */
            $scope.toggleSize = function() {
                if($scope.oldSize) {
                    $scope.gridsterConfig.sizeX = $scope.oldSize.sizeX;
                    $scope.gridsterConfig.sizeY = $scope.oldSize.sizeY;
                    $scope.gridsterConfig.col = $scope.oldSize.col;
                    $scope.gridsterConfig.row = $scope.oldSize.row;
                    $scope.oldSize = null;
                } else {
                    $scope.oldSize = {
                        col: $scope.gridsterConfig.col,
                        row: $scope.gridsterConfig.row,
                        sizeX: $scope.gridsterConfig.sizeX,
                        sizeY: $scope.gridsterConfig.sizeY
                    };
                    $scope.gridsterConfig.col = 0;
                    $scope.gridsterConfig.sizeX = MAXIMIZED_COLUMN_SIZE;
                    $scope.gridsterConfig.sizeY = Math.max(MAXIMIZED_ROW_SIZE, $scope.gridsterConfig.sizeY);
                }
            };
        }
    };
});
