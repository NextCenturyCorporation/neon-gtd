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
        templateUrl: "components/visualizationWidget/visualizationWidget.html",
        scope: {
            gridsterConfigs: "=",
            gridsterConfigIndex: "="
        },
        link: function($scope, $element) {
            var MAXIMIZED_COLUMN_SIZE = config.gridsterColumns || 6;
            var MAXIMIZED_ROW_SIZE = MAXIMIZED_COLUMN_SIZE * (2 / 3);

            // TODO Add to visualization configuration.
            var implementation = $scope.gridsterConfigs[$scope.gridsterConfigIndex].type === "lineChart" || $scope.gridsterConfigs[$scope.gridsterConfigIndex].type === "map" ? "multipleLayer" : "singleLayer";
            var superclassType = $scope.gridsterConfigs[$scope.gridsterConfigIndex].type === "filterBuilder" ? "filter-builder" : "visualization-superclass";

            var visualizationSuperclass = document.createElement("div");
            visualizationSuperclass.setAttribute(superclassType, "");
            visualizationSuperclass.setAttribute("implementation", implementation);
            visualizationSuperclass.setAttribute("name", $scope.gridsterConfigs[$scope.gridsterConfigIndex].name);
            visualizationSuperclass.setAttribute("type", $scope.gridsterConfigs[$scope.gridsterConfigIndex].type);
            visualizationSuperclass.setAttribute("state-id", $scope.gridsterConfigs[$scope.gridsterConfigIndex].id);
            visualizationSuperclass.setAttribute("visualization-id", $scope.gridsterConfigs[$scope.gridsterConfigIndex].type + "-" + uuid());

            // TODO Add to visualization configuration.
            if($scope.gridsterConfigs[$scope.gridsterConfigIndex].type === "map") {
                visualizationSuperclass.setAttribute("log-element-group", "map_group");
            }

            // TODO Add to visualization configuration.
            if($scope.gridsterConfigs[$scope.gridsterConfigIndex].type === "aggregationTable" || $scope.gridsterConfigs[$scope.gridsterConfigIndex].type === "dataTable") {
                visualizationSuperclass.setAttribute("log-element-group", "table_group");
                visualizationSuperclass.setAttribute("log-element-type", "datagrid");
            }

            // Save the bindings as a new object so that removing elements from the gridster configs doesn't cause errors.
            $scope.bindings = $scope.gridsterConfigs[$scope.gridsterConfigIndex].bindings || {};
            $scope.bindings.hideAdvancedOptions = config.hideAdvancedOptions;
            $scope.bindings.hideHeader = config.hideHeader;
            visualizationSuperclass.setAttribute("bindings", "bindings");

            $element.append($compile(visualizationSuperclass)($scope));

            if(config.hideCloseButton) {
                $scope.hideCloseButton = config.hideCloseButton;
            }

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
