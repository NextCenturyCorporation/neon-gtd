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
    return {
        restrict: 'A',
        scope: {
            gridsterConfigs: "=",
            gridsterConfigIndex: "="
        },
        template: '<div class="visualization-drag-handle"><div class="visualization-buttons" ng-class="{small: hideCloseButton}">' +
                '<a class="btn" ng-click="toggleSize()" ng-mouseover="$event.stopPropagation()" title="{{(oldSize) ? \'Shrink\' : \'Grow\'}}">' +
                '   <span  class="glyphicon" ng-class="(oldSize) ? \'glyphicon-resize-small\' : \'glyphicon-resize-full\'"></span>' +
                '</a>' +
                '<a class="btn" ng-click="remove()" ng-hide="hideCloseButton" ng-mouseover="$event.stopPropagation()" title="Delete">' +
                '   <span  class="glyphicon glyphicon-remove"></span>' +
                '</a>' +
                '<a class="btn move-to" ng-click="moveToTop()" ng-mouseover="$event.stopPropagation()" title="Move to Top">' +
                '   <span  class="glyphicon glyphicon-chevron-up"></span><span  class="glyphicon glyphicon-chevron-up"></span>' +
                '</a>' +
                '<a class="btn move-to" ng-click="moveToBottom()" ng-mouseover="$event.stopPropagation()" title="Move to Bottom">' +
                '   <span  class="glyphicon glyphicon-chevron-down"></span><span  class="glyphicon glyphicon-chevron-down"></span>' +
                '</a>' +
                '</div></div>',
        // templateUrl: "partials/directives/visualizationWidget.html",
        link: function($scope, $element) {
            var MAXIMIZED_COLUMN_SIZE = config.gridsterColumns || 6;
            var MAXIMIZED_ROW_SIZE = MAXIMIZED_COLUMN_SIZE * (2 / 3);

            // Create our widget.  Here, we are assuming the visualization is
            // implementated as an attribute directive.
            var widgetElement = document.createElement("div");
            widgetElement.setAttribute($scope.gridsterConfigs[$scope.gridsterConfigIndex].type, "");
            widgetElement.setAttribute('bind-state-id', "'" + $scope.gridsterConfigs[$scope.gridsterConfigIndex].id + "'");

            if(config.hideAdvancedOptions) {
                widgetElement.setAttribute("hide-advanced-options", true);
            }
            if(config.hideHeader) {
                widgetElement.setAttribute("hide-header", true);
            }
            if(config.hideCloseButton) {
                $scope.hideCloseButton = config.hideCloseButton;
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
                XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "workspace",
                        elementType: "workspace",
                        elementSub: $scope.gridsterConfigs[$scope.gridsterConfigIndex].type,
                        elementGroup: "top",
                        source: "user",
                        tags: ["remove", $scope.gridsterConfigs[$scope.gridsterConfigIndex].type]
                    });
                $scope.gridsterConfigs.splice($scope.gridsterConfigIndex, 1);
            };

            /**
             * Moves the visualization to the top row, keeping column position the same
             * @method moveToTop
             */
            $scope.moveToTop = function() {
                XDATA.userALE.log({
                        activity: "alter",
                        action: "click",
                        elementId: "workspace",
                        elementType: "workspace",
                        elementSub: "layout",
                        elementGroup: "top",
                        source: "user",
                        tags: ["visualization", "move", "top"]
                    });
                $scope.gridsterConfigs[$scope.gridsterConfigIndex].row = 0;
            };

            /**
             * Moves the visualization to the bottom row, keeping column position the same
             * @method moveToBottom
             */
            $scope.moveToBottom = function() {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "click",
                    elementId: "workspace",
                    elementType: "workspace",
                    elementSub: "layout",
                    elementGroup: "top",
                    source: "user",
                    tags: ["visualization", "move", "bottom"]
                });
                var maxVis = _.max($scope.gridsterConfigs, function(vis) {
                    return vis.row;
                });
                $scope.gridsterConfigs[$scope.gridsterConfigIndex].row = maxVis.row + maxVis.sizeY + 1;
            };
        }
    };
}]);
