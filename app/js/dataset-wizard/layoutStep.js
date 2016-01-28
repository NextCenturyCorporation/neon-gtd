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
angular.module('neonDemo.directives')
.directive('layoutStep', ['visualizations', 'config',
    function(visualizations, config) {
    return {
        templateUrl: 'partials/dataset-wizard/layoutStep.html',
        restrict: 'E',
        require: '^wizard',
        scope: {
            stepNumber: '='
        },
        link: function($scope, $element, $attrs, wizardCtrl) {
            $scope.isSelected = false;
            $scope.customVisualizations = [];
            $scope.customDatabases = [];
            $scope.visualizations = _.sortBy(visualizations, "name");
            $scope.widthTooltip = "The width of the visualization based upon the number of " +
                "columns set for the dashboard. The current number of columns is " + config.gridsterColumns +
                ", so a width of " + (config.gridsterColumns / 2) + " would make the visualization take up half " +
                "of the dashboard.";
            $scope.heightTooltip = "The height of the visualization using the same units as the width.";

            $("#customConnectionModal").tooltip({
                selector: '[data-toggle=tooltip]'
            });

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @method selectVisualization
             */
            $scope.selectVisualization = function(customVisualization) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "visualization-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["visualization", (customVisualization ? customVisualization.name : "")]
                });

                var viz = _.find(visualizations, function(visualization) {
                    return visualization.type === customVisualization.type;
                });

                if(viz) {
                    customVisualization.minSizeX = viz.minSizeX;
                    customVisualization.minSizeY = viz.minSizeY;
                    customVisualization.sizeX = viz.sizeX;
                    customVisualization.sizeY = viz.sizeY;

                    if(!customVisualization.database) {
                        customVisualization.database = $scope.customDatabases[0].database.name;

                        $scope.selectCustomVisualizationDatabase(customVisualization);
                        customVisualization.table = customVisualization.availableTables[0];
                    }
                }
            };

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @method selectCustomVisualizationDatabase
             */
            $scope.selectCustomVisualizationDatabase = function(customVisualization) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "visualization-database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["visualization", (customVisualization ? customVisualization.name : ""),
                        "database", (customVisualization ? customVisualization.database : "")]
                });

                _.find($scope.customDatabases, function(db) {
                    if(db.database.name === customVisualization.database) {
                        var tables = _.pluck(db.customTables, 'table');
                        customVisualization.availableTables = _.map(tables, function(table) {
                            return table.name;
                        });
                        customVisualization.table = "";
                    }
                });
            };

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @method selectCustomVisualizationTable
             */
            $scope.selectCustomVisualizationTable = function(customVisualization) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "visualization-table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: "user",
                    tags: ["visualization", (customVisualization ? customVisualization.name : ""),
                        "table", (customVisualization ? customVisualization.table : "")]
                });
            };

            /**
             * Adds a new custom visualization element to the global list of custom visualizations.
             * @method addNewCustomVisualization
             */
            $scope.addNewCustomVisualization = function() {
                $scope.customVisualizations.push({
                    availableTables: []
                });
            };

            /**
             * Removes the custom visualization element at the given index from the global list of custom visualizations.
             * @param {Number} index
             * @method removeCustomVisualization
             */
            $scope.removeCustomVisualization = function(index) {
                $scope.customVisualizations.splice(index, 1);
            };

            /**
             * Returns whether the database and table inputs should be shown for the given custom visualization object.
             * @param {Object} customVisualization
             * @method showVisualizationDatabaseProperties
             */
            $scope.showVisualizationDatabaseProperties = function(customVisualization) {
                if(!customVisualization.type || customVisualization.type === 'filter-builder' || customVisualization.type === 'map' ||
                    customVisualization.type === 'directed-graph' || customVisualization.type === 'gantt-chart') {
                    return false;
                }
                return true;
            };

            /**
             * Get the label for the given custom visualization object
             * @param {Object} customVisualization
             * @method getWidthLabel
             */
            $scope.getMinWidthLabel = function(customVisualization) {
                return (customVisualization.minSizeY ? "(min: " + customVisualization.minSizeX + ")" : "");
            };

            /**
             * Get the label for the given custom visualization object
             * @param {Object} customVisualization
             * @method getHeightLabel
             */
            $scope.getMinHeightLabel = function(customVisualization) {
                return (customVisualization.minSizeY ? "(min: " + customVisualization.minSizeY + ")" : "");
            };

            /*
             * Returns whether she step is valid and can go on to the next step.
             * @return {Boolean}
             * @method validateStep
             * @private
             */
            var validateStep = function() {
                return (_.every($scope.customVisualizations, function(viz) {
                        return viz.minSizeX <= viz.sizeX && viz.minSizeY <= viz.sizeY &&
                        viz.database && viz.table;
                    })
                );
            };

            /*
             * Shows/hides this step.
             * @param {Boolean} selected
             * @method selected
             * @private
             */
            var selected = function(selected) {
                $scope.isSelected = selected;
            };

            /*
             * Function to call on step initialization.
             * @method init
             * @private
             */
            var init = function(databases, customDatabases) {
                $scope.customDatabases = customDatabases;
                $scope.customVisualizations = [];
            };

            /*
             * Function to call when the step finishes.
             * @method onFinish
             * @private
             */
            var onFinish = function() {
                wizardCtrl.setCustomVisualizations($scope.customVisualizations);
            };

            wizardCtrl.addStep({
                title: "Set Layout",
                stepNumber: $scope.stepNumber,
                validateStep: validateStep,
                selected: selected,
                init: init,
                onFinish: onFinish
            });
        }
    };
}]);
