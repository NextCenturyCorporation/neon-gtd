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
            $scope.newVisualizationType = "";
            $scope.visualizations = _.sortBy(visualizations, "name");
            $scope.widthTooltip = "The width of the visualization based upon the number of " +
                "columns set for the dashboard. The current number of columns is " + config.gridsterColumns +
                ", so a width of " + (config.gridsterColumns / 2) + " would make the visualization take up half " +
                "of the dashboard.";
            $scope.heightTooltip = "The height of the visualization using the same units as the width.";
            $scope.visualizationBindings = {
                barchart: [
                    {
                        label: "X-Axis",
                        name: "bind-x-axis-field",
                        bindingName: "bar_x_axis"
                    },{
                        label: "Aggregation",
                        name: "bind-aggregation-field",
                        options: [{
                            name: "count",
                            prettyName: "Count",
                            defaultOption: true
                        },{
                            name: "sum",
                            prettyName: "Sum"
                        },{
                            name: "average",
                            prettyName: "Average"
                        }]
                    },{
                        label: "Y-Axis",
                        name: "bind-y-axis-field",
                        bindingName: "y_axis"
                    }
                ],
                "circular-heat-form": [
                    {
                        label: "Date Field",
                        name: "bind-date-field",
                        bindingName: "date"
                    }
                ],
                "count-by": [
                    {
                        label: "Group Field",
                        name: "bind-data-field",
                        bindingName: "count_by"
                    },{
                        label: "Aggregation",
                        name: "bind-aggregation",
                        options: [{
                            name: "count",
                            prettyName: "Count",
                            defaultOption: true
                        },{
                            name: "min",
                            prettyName: "Minimum"
                        },{
                            name: "max",
                            prettyName: "maximum"
                        }]
                    },{
                        label: "Aggregation Field",
                        name: "bind-aggregation-field"
                    }
                ],
                "directed-graph": [],
                "filter-builder": [],
                "gantt-chart": [
                    {
                        label: "Start Field",
                        name: "bind-start-field"
                    },{
                        label: "End Field",
                        name: "bind-end-field"
                    },{
                        label: "Color Field",
                        name: "bind-color-field"
                    }
                ],
                linechart: [
                    {
                        label: "Date Granularity",
                        name: "bind-granularity",
                        options: [{
                            name: "day",
                            prettyName: "Day",
                            defaultOption: true
                        },{
                            name: "hour",
                            prettyName: "Hour"
                        }]
                    }
                ],
                map: [],
                newsfeed: [
                    {
                        label: "Primary Title Field",
                        name: "bind-primary-title-field"
                    },{
                        label: "Secondary Title Field",
                        name: "bind-secondary-title-field"
                    },{
                        label: "Date Field",
                        name: "bind-date-field",
                        bindingName: "date"
                    },{
                        label: "Content Field",
                        name: "bind-content-field"
                    }
                ],
                "plotly-graph": [
                    {
                        label: "X Attribute",
                        name: "bind-attr-x"
                    },{
                        label: "Y Attribute",
                        name: "bind-attr-y"
                    },{
                        label: "Type",
                        name: "graph-type",
                        options: [{
                            name: "scatter",
                            prettyName: "Scatter Plot",
                            defaultOption: true
                        },{
                            name: "heatmapScatter",
                            prettyName: "Heatmap Scatter Plot"
                        },{
                            name: "histogramScatter",
                            prettyName: "Histogram Plot"
                        }]
                    }
                ],
                "query-results-table": [],
                sunburst: [],
                "tag-cloud": [
                    {
                        label: "Data Field",
                        name: "bind-tag-field",
                        bindingName: "tags"
                    }
                ],
                "timeline-selector": [
                    {
                        label: "Date Field",
                        name: "bind-date-field",
                        bindingName: "date"
                    },{
                        label: "Date Granularity",
                        name: "bind-granularity",
                        options: [{
                            name: "year",
                            prettyName: "Year"
                        },{
                            name: "month",
                            prettyName: "Month"
                        },{
                            name: "day",
                            prettyName: "Day",
                            defaultOption: true
                        },{
                            name: "hour",
                            prettyName: "Hour"
                        }]

                    }
                ]
            };

            $("#customConnectionModal").tooltip({
                selector: '[data-toggle=tooltip]'
            });

            /**
             * Toggles the custom visualization options display for the given custom visualization.
             * @param {Object} customVisualization
             * @method toggleCustomVisualization
             */
            $scope.toggleCustomVisualization = function(customVisualization) {
                customVisualization.toggled = !customVisualization.toggled;
            };

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @param {Boolean} systemEvent
             * @method selectCustomVisualizationDatabase
             */
            $scope.selectCustomVisualizationDatabase = function(customVisualization, systemEvent) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "visualization-database-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: (systemEvent ? "system" : "user"),
                    tags: ["visualization", (customVisualization ? customVisualization.name : ""),
                        "database", (customVisualization ? customVisualization.database : "")]
                });

                _.each($scope.customDatabases, function(db) {
                    if(db.database.name === customVisualization.database) {
                        var tables = _.pluck(db.customTables, 'table');
                        customVisualization.availableTables = _.map(tables, function(table) {
                            return table.name;
                        });
                        customVisualization.table = customVisualization.availableTables[0];
                    }
                });

                $scope.selectCustomVisualizationTable(customVisualization, systemEvent);
            };

            /**
             * Selection event for the given custom visualization object.
             * @param {Object} customVisualization
             * @param {Boolean} systemEvent
             * @method selectCustomVisualizationTable
             */
            $scope.selectCustomVisualizationTable = function(customVisualization, systemEvent) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "visualization-table-selector",
                    elementType: "combobox",
                    elementGroup: "top",
                    source: (systemEvent ? "system" : "user"),
                    tags: ["visualization", (customVisualization ? customVisualization.name : ""),
                        "table", (customVisualization ? customVisualization.table : "")]
                });

                customVisualization.bindings = {};

                _.each($scope.customDatabases, function(db) {
                    if(db.database.name === customVisualization.database) {
                        _.each(db.customTables, function(customTable) {
                            if(customTable.table.name === customVisualization.table) {
                                customVisualization.availableFields = customTable.table.fields;

                                // Attach mappings to bindings
                                _.each(customVisualization.bindingOptions, function(option) {
                                    if(option.bindingName && customTable[option.bindingName]) {
                                        customVisualization.bindings[option.name] = customTable[option.bindingName].columnName;
                                    } else if(option.options) {
                                        var defaultOption = _.find(option.options, {
                                            defaultOption: true
                                        });
                                        customVisualization.bindings[option.name] = (defaultOption ? defaultOption.name : option.options[0].name);
                                    }
                                });
                            }
                        });
                    }
                });
            };

            /**
             * Adds a new custom visualization element to the global list of custom visualizations.
             * @method addNewCustomVisualization
             */
            $scope.addNewCustomVisualization = function() {
                var viz = _.find(visualizations, function(visualization) {
                    return visualization.type === $scope.newVisualizationType;
                });

                if(viz) {
                    var length = $scope.customVisualizations.push({
                        type: $scope.newVisualizationType,
                        name: viz.name,
                        minSizeX: viz.minSizeX,
                        minSizeY: viz.minSizeY,
                        sizeX: viz.sizeX,
                        sizeY: viz.sizeY,
                        database: $scope.customDatabases[0].database.name,
                        toggled: true,
                        bindings: {},
                        bindingOptions: $scope.visualizationBindings[$scope.newVisualizationType]
                    });

                    $scope.selectCustomVisualizationDatabase($scope.customVisualizations[length - 1], true);
                }

                $scope.newVisualizationType = "";
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
                    customVisualization.type === 'directed-graph' || customVisualization.type === 'linechart') {
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
                $scope.newVisualizationType = "";
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
