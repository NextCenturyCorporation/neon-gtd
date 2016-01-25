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
.directive('plotlyGraph', ['FilterService', 'DatasetService', 'ConnectionService',
function(filterService, datasetService, connectionService) {
    return {
        templateUrl: 'partials/directives/plotlyGraph.html',
        restrict: 'EA',
        scope: {
            graphType: "=",
            subType: "=?",
            bindLimit: "=?",
            bindFilterField: "=?",
            bindAttrX: "=?",
            bindAttrY: "=?"
        },
        link: function($scope, el) {
            $scope.el = el;
            var graphDivSelector = $(el).find('.graph-div');
            el.addClass("plotly-graph-directive");

            graphDivSelector.bind('plotly_relayout', $scope.updateFilter);

            graphDivSelector.bind('plotly_filter_box', $scope.updateFilter);

            $scope.graphDiv = graphDivSelector[0];

            var setHeight = function() {
                var topHeight = $($scope.el).find('.header-container').outerHeight(true);
                $($scope.graphDiv).height($($scope.el).height() - topHeight);
                if($scope.data) {
                    $scope.drawGraph($scope.data);
                }
            };

            setHeight();

            $scope.el.resize(setHeight);

            $scope.init();
        },
        controller: function($scope) {
            $scope.active = {};

            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.events({
                    filtersChanged: $scope.queryForData
                });

                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, $scope.queryForData);

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        $scope.clearFilterSet();
                    }
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    $scope.el.off('resize');

                    if($scope.outstandingQuery) {
                        $scope.outstandingQuery.abort();
                    }
                });

                initDataset();
                $scope.updateTables();

                $scope.filterKeys = filterService.createFilterKeys("plotly", datasetService.getDatabaseAndTableNames());

                $scope.updateFields();
                $scope.active.limitCount = $scope.bindLimit;

                $scope.queryForData();
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
                $scope.filterKeys = filterService.createFilterKeys("plotlyGraph", datasetService.getDatabaseAndTableNames());
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
            };

            $scope.updateFields = function() {
                $scope.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);

                var xFieldName = $scope.bindAttrX ||
                    datasetService.getMapping($scope.active.database.name, $scope.active.table.name, "x_attr") ||
                    "";

                $scope.active.attrX = _.find($scope.fields, function(field) {
                    return field.columnName === xFieldName;
                }) || datasetService.createBlankField();

                var yFieldName = $scope.bindAttrY ||
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

                    if($scope.graphType === 'scattergl') {
                        query.ignoreFilters([$scope.filterKeys[$scope.active.database.name][$scope.active.table.name]]);
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
                                    $scope.drawGraph(queryResults.data);
                                }
                                $scope.loadingData = false;
                            });
                        });
                    }
                }
            };

            $scope.drawGraph = function(data) {
                var dataObject = buildDataConfig(data);
                var layout = buildGraphLayout();

                //This can be swapped out with Plotly.deleteTrace and Plotly.plot if we add a way to track traces.
                $($scope.graphDiv).empty();
                Plotly.newPlot($scope.graphDiv, dataObject, layout);
            };

            var buildDataConfig = function(data) {
                var dataConfig = [];

                if($scope.graphType === 'scattergl') {
                    dataConfig = buildScatterGLConfig(data, $scope.subType);
                } else if($scope.graphType === 'scatter') {
                    dataConfig = buildScatterConfig(data);
                } else if($scope.graphType === 'histogramScatter') {
                    dataConfig = buildHistogramHybridConfig(data);
                } else if($scope.graphType === 'heatmapScatter') {
                    dataConfig = buildHeatmapHybridConfig(data);
                }

                return dataConfig;
            };

            var buildScatterGLConfig = function(data, markerType) {
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

                var dataConfig = [{
                    x: x,
                    y: y,
                    mode: (markerType || 'markers'),
                    type: 'scattergl',
                    hoverinfo: 'text'
                }];

                if(text.length > 0) {
                    dataConfig[0].text = text;
                }

                return dataConfig;
            };

            var buildScatterConfig = function(data) {
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

                var dataConfig = [{
                    x: x,
                    y: y,
                    mode: 'markers',
                    type: 'scatter',
                    hoverinfo: 'text'
                }];

                if(text.length > 0) {
                    dataConfig[0].text = text;
                }

                return dataConfig;
            };

            var buildHistogramHybridConfig = function(data) {
                var config = [];
                var x = [];
                var y = [];

                if(data.length > 20000) {
                    _.each(data, function(row) {
                        x.push(row[$scope.active.attrX.columnName]);
                        y.push(row[$scope.active.attrY.columnName]);
                    });

                    var dataConfig = {
                        x: x,
                        y: y,
                        colorscale: [
                            [0, 'rgb(255,255,255)'],
                            [0.0001, 'rgb(0, 255, 0)'],
                            [0.33, 'rgb(255, 255, 0)'],
                            [1, 'rgb(255,0,0)']
                        ],
                        showscale: true,
                        type: 'histogram2d',
                        hoverinfo: 'z'
                    };
                    config.push(dataConfig);
                } else {
                    config = buildScatterConfig(data);
                }
                return config;
            };

            var buildHeatmapHybridConfig = function(data) {
                var config = [];
                var x = [];
                var y = [];

                if(data.length > 20000) {
                    _.each(data, function(row) {
                        x.push(row[$scope.active.attrX.columnName]);
                        y.push(row[$scope.active.attrY.columnName]);
                    });

                    var dataConfig = {
                        x: x,
                        y: y,
                        colorscale: [
                            [0, 'rgb(255,255,255)'],
                            [0.0001, 'rgb(0, 255, 0)'],
                            [0.2, 'rgb(255, 255, 0)'],
                            [1, 'rgb(255,0,0)']
                        ],
                        showscale: true,
                        type: 'histogram2dcontour',
                        hoverinfo: 'z',
                        contours: {
                            coloring: 'heatmap',
                            showlines: false
                        },
                        line: {
                            width: 0
                        },
                        ncontours: 0
                    };
                    config.push(dataConfig);
                } else {
                    config = buildScatterConfig(data);
                }
                return config;
            };

            var buildGraphLayout = function() {
                var layout = {};

                if($scope.graphType === 'scattergl') {
                    layout = buildScatterGLLayout();
                } else if($scope.graphType === 'scatter') {
                    layout = buildScatterLayout();
                } else if($scope.graphType === 'histogramScatter' || $scope.graphType === 'heatmapScatter') {
                    layout = buildHybridLayout();
                }

                return layout;
            };

            var buildScatterGLLayout = function() {
                return {
                    showlegend: false,
                    yaxis: {
                        side: 'left',
                        showgrid: false,
                        zeroline: false
                    },
                    xaxis: {
                        showgrid: false,
                        zeroline: false,
                        side: 'bottom'
                    }
                };
            };

            var buildScatterLayout = function() {
                return {
                    showlegend: false,
                    yaxis: {
                        side: 'left',
                        showgrid: false,
                        zeroline: false
                    },
                    xaxis: {
                        showgrid: false,
                        zeroline: false,
                        side: 'bottom'
                    }
                };
            };

            var buildHybridLayout = function() {
                return {
                    showlegend: false,
                    xaxis: {
                        showgrid: false,
                        zeroline: false
                    },
                    yaxis: {
                        showgrid: false,
                        zeroline: false
                    },
                    hovermode: 'closest'
                };
            };

            $scope.updateFilter = function(event, focus) {
                var relations;
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

                    relations = datasetService.getRelations($scope.active.database.name, $scope.active.table.name, [$scope.active.attrX, $scope.active.attrY]);
                    filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClause, "PlotlyGraph");
                } else if(focus['xaxis.autorange'] && focus['yaxis.autorange']) {
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
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

                    relations = datasetService.getRelations($scope.active.database.name, $scope.active.table.name, [$scope.active.attrX, $scope.active.attrY]);
                    filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClause, "PlotlyGraph", $scope.queryForData);
                }
            };
        }
    };
}]);