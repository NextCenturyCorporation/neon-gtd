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
 *    &lt;div visualization-widget gridster-configs="items" gridster-config-index="0"&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class visulizationWidget
 * @constructor
 */
angular.module('neonDemo.directives').directive('visualizationWidget', ["config", "$compile", function(config, $compile) {
    var MAXIMIZED_COLUMN_SIZE = 6;
    var MAXIMIZED_ROW_SIZE = 4;

    return {
        restrict: 'A',
        scope: {
            gridsterConfigs: "=",
            gridsterConfigIndex: "="
        },
        template: '<div class="visualization-drag-handle"><div class="visualization-buttons">' +
                '<a class="btn" ng-click="toggleSize()"" ng-mouseover="$event.stopPropagation()">' +
                '   <span  class="glyphicon" ng-class="(oldSize) ? \'glyphicon-resize-small\' : \'glyphicon-resize-full\'"></span>' +
                '</a>' +
                '<a class="btn" ng-click="remove()" ng-mouseover="$event.stopPropagation()">' +
                '   <span  class="glyphicon glyphicon-remove"></span>' +
                '</a>' +
                '</div></div>',
//        templateUrl: "partials/directives/visualizationWidget.html",
        link: function($scope, $element) {
            // Create our widget.  Here, we are assuming the visualization is
            // implementated as an attribute directive.
            var widgetElement = document.createElement("div");
            widgetElement.setAttribute($scope.gridsterConfigs[$scope.gridsterConfigIndex].type, "");

            if(config.hideAdvancedOptions) {
                widgetElement.setAttribute("hide-advanced-options", true);
            }
            if(config.hideHeader) {
                widgetElement.setAttribute("hide-header", true);
            }

            // Pass along any bindings.
            if($scope.gridsterConfigs[$scope.gridsterConfigIndex] &&
                $scope.gridsterConfigs[$scope.gridsterConfigIndex].bindings) {
                var bindings = $scope.gridsterConfigs[$scope.gridsterConfigIndex].bindings;
                for(var prop in bindings) {
                    if(bindings.hasOwnProperty(prop)) {
                        widgetElement.setAttribute(prop, bindings[prop]);
                    }
                }
            }

            $element.append($compile(widgetElement)($scope));

            /**
             * Toggles the visualization widget between default and maximized views.
             * @method toggleSize
             */
            $scope.toggleSize = function() {
                if($scope.oldSize) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "click",
                        elementId: "workspace",
                        elementType: "workspace",
                        elementSub: "layout",
                        elementGroup: "top",
                        source: "user",
                        tags: ["visualization", "minimize"]
                    });
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeX = $scope.oldSize.sizeX;
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeY = $scope.oldSize.sizeY;
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].col = $scope.oldSize.col;
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].row = $scope.oldSize.row;
                    $scope.oldSize = null;
                } else {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "click",
                        elementId: "workspace",
                        elementType: "workspace",
                        elementSub: "layout",
                        elementGroup: "top",
                        source: "user",
                        tags: ["visualization", "maximize"]
                    });
                    $scope.oldSize = {
                        col: $scope.gridsterConfigs[$scope.gridsterConfigIndex].col,
                        row: $scope.gridsterConfigs[$scope.gridsterConfigIndex].row,
                        sizeX: $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeX,
                        sizeY: $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeY
                    };
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].col = 0;
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeX = MAXIMIZED_COLUMN_SIZE;
                    $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeY = Math.max(MAXIMIZED_ROW_SIZE,
                        $scope.gridsterConfigs[$scope.gridsterConfigIndex].sizeY);
                }
            };

            /**
             * Remove ourselves from the visualization list.
             * @method remove
             */
            $scope.remove = function() {
                $scope.gridsterConfigs.splice($scope.gridsterConfigIndex, 1);
            };
        }
    };
}]);
