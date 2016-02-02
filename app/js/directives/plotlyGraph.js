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
 * This directive adds a graph using the plotly.js library to control a d3 based svg graph
 * or a stackGL based scatterplot
 *
 * Config options:
 *      graphType: This controls which configuration and graph type will be used. Supported
 *                  values are: 'scatterGl' - a gl based scatterplot
 *                              'scatter' - an svg based scatterplot
 *                              'histogramScatter' - a hybrid heatmap histogram / scatterplot; heatmap is used
 *                                                  above 20000 points, and scatterplot is used below 20000 points
 *                              'heatmapScatter' - a hybrid gradient heatmap contour chart / scatterplot; heatmap is used
 *                                                  above 20000 points, and scatterplot is used below 20000 points
 *      subType: This controls the line or marker type of the scatterplotGl graphTypes.
 *                  Supported values are: 'lines', 'markers', 'lines+markers'
 *      bindLimit: A limit of the number of values to display. Defaults to unlimited
 *      bindFilterField: The field to use for filtering when clicking a point as well as the field value shown on point hover
 *      bindAttrX: The field to use for x axis; alternatively populated with x_attr mapping
 *      bindAttrY: The field to use for y axis; alternatively populated with y_attr mapping
 * @namespace neonDemo.directives
 * @class plotlyGraph
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('plotlyGraph', ['ConnectionService', 'DatasetService', 'FilterService', 'ThemeService', 'VisualizationService',
function(connectionService, datasetService, filterService, themeService, visualizationService) {
    return {
        templateUrl: 'partials/directives/plotlyGraph.html',
        restrict: 'EA',
        scope: {
            graphType: "=",
            subType: "=?",
            bindLimit: "=?",
            bindXAxisField: "=?",
            bindYAxisField: "=?",
            bindAttrX: "=?", // Deprecated
            bindAttrY: "=?", // Deprecated
            bindFilterField: "=?", // Deprecated
            bindStateId: '='
        },
        link: function($scope, $element) {
            $scope.element = $element;
            var graphDivSelector = $element.find('.graph-div');
            $element.addClass("plotly-graph-directive");

            graphDivSelector.bind('plotly_relayout', $scope.updateFilter);

            graphDivSelector.bind('plotly_filter_box', $scope.updateFilter);

            $scope.graphDiv = graphDivSelector[0];
            $scope.graphId = "plotly-" + uuid();
            $scope.backgroundColor = "#fff";
            $scope.textColor = "#777";

            var setHeight = function() {
                var headerHeight = 0;
                $scope.element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $($scope.graphDiv).height($scope.element.height() - headerHeight);
                $scope.drawGraph();
            };

            setHeight();

            $element.resize(setHeight);

            $scope.init();
        },
        controller: ["$scope", function($scope) {
            $scope.active = {
                type: $scope.graphType,
                limitCount: $scope.bindLimit
            };

            // TODO Add scattergl once bugs are fixed in the plotly library.
            if($scope.active.type !== "scatter" && $scope.active.type !== "heatmapScatter" && $scope.active.type !== "histogramScatter") {
                $scope.active.type = "scatter";
            }

            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, $scope.queryForData);

                themeService.registerListener($scope.graphId, onThemeChanged);

                visualizationService.register($scope.bindStateId, bindFields);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if($scope.filterSet) {
                        filterService.removeFilter($scope.active.database.name, $scope.active.table.name, [$scope.active.attrX.columnName, $scope.active.attrY.columnName]);
                    }
                    $scope.element.off('resize');

                    if($scope.outstandingQuery) {
                        $scope.outstandingQuery.abort();
                    }
                    themeService.unregisterListener($scope.graphId);
                    visualizationService.unregister($scope.bindStateId);
                });

                initDataset();
            };

            var initDataset = function() {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.active.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.active.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                $scope.updateTables();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.active.database.name);
                $scope.active.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.active.table = $scope.tables[i];
                            break;
                        }
                    }
                }

                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);

                var xFieldName = $scope.bindXAxisField || $scope.bindAttrX ||
                    datasetService.getMapping($scope.active.database.name, $scope.active.table.name, "x_attr") ||
                    "";

                $scope.active.attrX = _.find($scope.fields, function(field) {
                    return field.columnName === xFieldName;
                }) || datasetService.createBlankField();

                var yFieldName = $scope.bindYAxisField || $scope.bindAttrY ||
                    datasetService.getMapping($scope.active.database.name, $scope.active.table.name, "y_attr") ||
                    "";
                $scope.active.attrY = _.find($scope.fields, function(field) {
                    return field.columnName === yFieldName;
                }) || datasetService.createBlankField();

                if($scope.bindFilterField) {
                    $scope.filterField = _.find($scope.fields, function(field) {
                        return field.columnName === $scope.bindFilterField;
                    });
                }

                $scope.queryForData();
            };

            var buildQuery = function() {
                if($scope.active.attrX && $scope.active.attrY && $scope.active.database && $scope.active.table) {
                    var fields = [$scope.active.attrX.columnName, $scope.active.attrY.columnName];
                    if($scope.filterField) {
                        fields.push($scope.filterField.columnName);
                    }

                    var query = new neon.query.Query()
                        .selectFrom($scope.active.database.name, $scope.active.table.name)
                        .withFields(fields)
                        .where($scope.active.attrX.columnName, '!=', null);

                    if($scope.active.limitCount) {
                        query.limit($scope.active.limitCount);
                    }

                    return query;
                }
                return;
            };

            $scope.queryForData = function() {
                var connection = connectionService.getActiveConnection();

                if(connection) {
                    var query = buildQuery();

                    if(query) {
                        if($scope.outstandingQuery) {
                            $scope.outstandingQuery.abort();
                        }

                        $scope.outstandingQuery = connection.executeQuery(query);
                        $scope.outstandingQuery.always(function() {
                            $scope.outstandingQuery = undefined;
                        });
                        $scope.outstandingQuery.done(function(queryResults) {
                            $scope.$apply(function() {
                                if(queryResults.data) {
                                    $scope.data = queryResults.data;
                                    $scope.drawGraph();
                                }
                                $scope.loadingData = false;
                            });
                        });
                    }
                }
            };

            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.active.database.name && message.addedFilter.tableName === $scope.active.table.name) {
                    $scope.queryForData();
                }
            };

            $scope.drawGraph = function() {
                if(!$scope.data) {
                    return;
                }

                var dataObject = buildDataConfig($scope.data);
                var layout = buildGraphLayout();

                //This can be swapped out with Plotly.deleteTrace and Plotly.plot if we add a way to track traces.
                $($scope.graphDiv).empty();
                Plotly.newPlot($scope.graphDiv, [dataObject], layout);
            };

            var buildDataConfig = function(data) {
                if($scope.active.type === 'histogramScatter') {
                    return buildHistogramHybridConfig(data);
                }

                if($scope.active.type === 'heatmapScatter') {
                    return buildHeatmapHybridConfig(data);
                }

                return buildScatterConfig(data);
            };

            var buildScatterConfig = function(data, markerType) {
                var x = [];
                var y = [];
                var text = [];

                var minx;
                var maxx;
                var miny;
                var maxy;

                _.each(data, function(row) {
                    x.push(row[$scope.active.attrX.columnName]);

                    if(row[$scope.active.attrX.columnName] < minx) {
                        minx = row[$scope.active.attrX.columnName];
                    }

                    if(row[$scope.active.attrX.columnName] > maxx) {
                        maxx = row[$scope.active.attrX.columnName];
                    }

                    y.push(row[$scope.active.attrY.columnName]);

                    if(row[$scope.active.attrY.columnName] < miny) {
                        miny = row[$scope.active.attrY.columnName];
                    }

                    if(row[$scope.active.attrY.columnName] > maxy) {
                        maxy = row[$scope.active.attrY.columnName];
                    }

                    if($scope.filterField) {
                        var textVal = row[$scope.filterField.columnName];
                        if(textVal.length > 50) {
                            textVal = textVal.substring(0, 51) + '...';
                        }

                        text.push(textVal);
                    }
                });

                var dataConfig = {
                    x: x,
                    y: y,
                    mode: ($scope.subType || 'markers'),
                    type: $scope.active.type,
                    hoverinfo: 'text'
                };

                if(text.length > 0) {
                    dataConfig.text = text;
                }

                return dataConfig;
            };

            var buildHybridConfig = function(data) {
                var x = [];
                var y = [];

                _.each(data, function(row) {
                    x.push(row[$scope.active.attrX.columnName]);
                    y.push(row[$scope.active.attrY.columnName]);
                });

                return {
                    x: x,
                    y: y,
                    showscale: true,
                    hoverinfo: 'z'
                };
            };

            var buildHistogramHybridConfig = function(data) {
                if(data.length > 20000) {
                    var config = buildHybridConfig(data);
                    config.colorscale = [
                        [0, $scope.backgroundColor],
                        [0.0001, 'rgb(0, 255, 0)'],
                        [0.33, 'rgb(255, 255, 0)'],
                        [1, 'rgb(255,0,0)']
                    ];
                    config.type = 'histogram2d';
                    return config;
                }

                return buildScatterConfig(data);
            };

            var buildHeatmapHybridConfig = function(data) {
                if(data.length > 20000) {
                    var config = buildHybridConfig(data);
                    config.colorscale = [
                        [0, $scope.backgroundColor],
                        [0.0001, 'rgb(0, 255, 0)'],
                        [0.2, 'rgb(255, 255, 0)'],
                        [1, 'rgb(255,0,0)']
                    ];
                    config.type = 'histogram2dcontour';
                    config.contours = {
                        coloring: 'heatmap',
                        showlines: false
                    };
                    config.line = {
                        width: 0
                    };
                    config.ncontours = 0;
                    return config;
                }

                return buildScatterConfig(data);
            };

            var buildGraphLayout = function() {
                var layout = {
                    font: {
                        color: $scope.textColor
                    },
                    margin: {
                        l: 70,
                        r: 10,
                        t: 20,
                        b: 60
                    },
                    paper_bgcolor: $scope.backgroundColor,
                    plot_bgcolor: $scope.backgroundColor,
                    showlegend: false,
                    xaxis: {
                        title: $scope.active.attrX.prettyName,
                        showgrid: false,
                        zeroline: false
                    },
                    yaxis: {
                        title: $scope.active.attrY.prettyName,
                        showgrid: false,
                        zeroline: false
                    }
                };

                if($scope.active.type === 'scatter' || $scope.active.type === 'scattergl') {
                    layout = buildScatterLayout(layout);
                } else if($scope.active.type === 'histogramScatter' || $scope.active.type === 'heatmapScatter') {
                    layout = buildHybridLayout(layout);
                }

                return layout;
            };

            var buildScatterLayout = function(layout) {
                layout.xaxis.side = "bottom";
                layout.yaxis.side = "left";
                return layout;
            };

            var buildHybridLayout = function(layout) {
                layout.hovermode = "closest";
                return layout;
            };

            $scope.updateFilter = function(event, focus) {
                var createFilterClause;

                if(focus.x && focus.y) {
                    createFilterClause = function() {
                        var filterClause = neon.query.where($scope.active.attrX.columnName, '!=', null);

                        filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrX.columnName, '>', focus.x[0]));
                        filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrX.columnName, '<', focus.x[1]));
                        filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrY.columnName, '>', focus.y[0]));
                        filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrY.columnName, '<', focus.y[1]));
                        return filterClause;
                    };

                    filterService.addFilter($scope.messenger, $scope.active.database.name, $scope.active.table.name, [$scope.active.attrX.columnName, $scope.active.attrY.columnName],
                        createFilterClause, "PlotlyGraph");
                } else if(focus['xaxis.autorange'] && focus['yaxis.autorange']) {
                    filterService.removeFilter($scope.active.database.name, $scope.active.table.name, [$scope.active.attrX.columnName, $scope.active.attrY.columnName], $scope.queryForData);
                } else {
                    createFilterClause = function() {
                        var filterClause = neon.query.where($scope.active.attrX.columnName, '!=', null);

                        if(focus['xaxis.range']) {
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrX.columnName, '>', focus['xaxis.range'][0]));
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrX.columnName, '<', focus['xaxis.range'][1]));
                        }

                        if(focus['yaxis.range']) {
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrY.columnName, '>', focus['yaxis.range'][0]));
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrY.columnName, '<', focus['yaxis.range'][1]));
                        }

                        if(focus['xaxis.range[0]']) {
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrX.columnName, '>', focus['xaxis.range[0]']));
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrX.columnName, '<', focus['xaxis.range[1]']));
                        }

                        if(focus['yaxis.range[0]']) {
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrY.columnName, '>', focus['yaxis.range[0]']));
                            filterClause = neon.query.and(filterClause, neon.query.where($scope.active.attrY.columnName, '<', focus['yaxis.range[1]']));
                        }

                        return filterClause;
                    };

                    filterService.addFilter($scope.messenger, $scope.active.database.name, $scope.active.table.name, [$scope.active.attrX.columnName, $scope.active.attrY.columnName],
                        createFilterClause, "PlotlyGraph", $scope.queryForData);
                }
            };

            var onThemeChanged = function(theme) {
                if(theme.backgroundColor !== $scope.backgroundColor || theme.textColor !== $scope.textColor) {
                    $scope.backgroundColor = theme.backgroundColor;
                    $scope.textColor = theme.textColor;
                    $scope.drawGraph();
                }
            };

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate the visualization's state.
             * @return {Object}
             * @method bindFields
             * @private
             */
            var bindFields = function() {
                var bindingFields = {};

                bindingFields["graph-type"] = $scope.active.type ? "'" + $scope.active.type + "'" : undefined;
                bindingFields["sub-type"] = ($scope.subType || 'markers');
                bindingFields["bind-limit"] = $scope.active.limitCount ? "'" + $scope.active.limitCount + "'" : undefined;
                bindingFields["bind-x-axis-field"] = ($scope.active.attrX && $scope.active.attrX.columnName) ? "'" + $scope.active.attrX.columnName + "'" : undefined;
                bindingFields["bind-y-axis-field"] = ($scope.active.attrY && $scope.active.attrY.columnName) ? "'" + $scope.active.attrY.columnName + "'" : undefined;

                return bindingFields;
            };
        }]
    };
}]);
