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
 * This directive adds a barchart with stacked bars to the DOM and drives the visualization data from
 * whatever database and table are currently selected in neon.  This directive accomplishes that
 * by using getting a neon connection from a connection service and listening for
 * neon system events (e.g., data tables changed).  On these events, it requeries the active
 * connection for data and updates applies the change to its scope.  The contained
 * barchart will update as a result.
 * @namespace neonDemo.directives
 * @class stackedbarchart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('stackedbarchart', ['ConnectionService', 'DatasetService', 'ErrorNotificationService',
function(connectionService, datasetService, errorNotificationService) {
    return {
        templateUrl: 'partials/directives/barchart.html',
        restrict: 'E',
        scope: {
            attrX: '=',
            attrY: '=',
            barType: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('barchartDirective');

            $scope.element = $element;

            $scope.messenger = new neon.eventing.Messenger();

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.errorMessage = undefined;
            $scope.outstandingQuery = undefined;

            $scope.options = {
                database: {},
                table: {},
                attrX: "",
                attrY: "",
                barType: "count"
            };

            var COUNT_FIELD_NAME = 'Count';

            var initialize = function() {
                drawBlankChart();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    $scope.queryForData();
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "stacked-barchart",
                        elementType: "canvas",
                        elementSub: "stacked-barchart",
                        elementGroup: "chart_group",
                        source: "user",
                        tags: ["remove", "stacked-barchart"]
                    });
                    $scope.messenger.removeEvents();
                });

                $scope.$watch('options.attrX', function() {
                    if($scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('options.attrY', function() {
                    if($scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
                $scope.$watch('options.barType', function() {
                    if($scope.options.database.name && $scope.options.table.name) {
                        $scope.queryForData();
                    }
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    $scope.queryForData();
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            var displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["x_axis", "y_axis"]) || $scope.tables[0];
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var attrX = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "x_axis") || "";
                $scope.options.attrX = _.find($scope.fields, function(field) {
                    return field.columnName === attrX;
                }) || {
                    columnName: "",
                    prettyName: ""
                };
                var attrY = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "y_axis") || "";
                $scope.options.attrY = _.find($scope.fields, function(field) {
                    return field.columnName === attrY;
                }) || {
                    columnName: "",
                    prettyName: ""
                };

                $scope.queryForData(true);
            };

            var queryData = function(yRuleComparator, yRuleVal, next) {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var xAxis = $scope.options.attrX.columnName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "x_axis");
                var yAxis = $scope.options.attrY.columnName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "y_axis");
                if(!yAxis) {
                    yAxis = COUNT_FIELD_NAME;
                }

                var query = new neon.query.Query()
                    .selectFrom($scope.options.database.name, $scope.options.table.name)
                    .where(xAxis, '!=', null)
                    .where(yAxis, yRuleComparator, yRuleVal)
                    .groupBy(xAxis);

                var queryType;
                $scope.options.barType = 'count';
                if($scope.options.barType === 'count') {
                    queryType = neon.query.COUNT;
                } else if($scope.options.barType === 'sum') {
                    queryType = neon.query.SUM;
                } else if($scope.options.barType === 'avg') {
                    queryType = neon.query.AVG;
                }

                if(yAxis) {
                    query.aggregate(queryType, yAxis, ($scope.options.barType ? COUNT_FIELD_NAME : yAxis));
                } else {
                    query.aggregate(queryType, '*', ($scope.options.barType ? COUNT_FIELD_NAME : yAxis));
                }

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    if($scope.outstandingQuery) {
                        $scope.outstandingQuery.abort();
                    }

                    $scope.outstandingQuery = connection.executeQuery(query).xhr.done(function(queryResults) {
                        $scope.outstandingQuery = undefined;
                        next(queryResults);
                    }).fail(function(response) {
                        $scope.outstandingQuery = undefined;
                        if(response.status !== 0) {
                            $scope.drawBlankChart();
                            if(response.responseJSON) {
                                $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                            }
                        }
                    });
                }
            };

            $scope.queryForData = function() {
                var xAxis = $scope.options.attrX.columnName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "x_axis");
                var yAxis = $scope.options.attrY.columnName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "y_axis");
                if(!yAxis) {
                    yAxis = COUNT_FIELD_NAME;
                }

                var yField = ($scope.options.barType ? COUNT_FIELD_NAME : yAxis);
                var yMin = yField + "-min";

                var results = {
                    data: []
                };

                queryData('>', 0, function(posResults) {
                    for(var i = 0; i < posResults.data.length; i++) {
                        posResults.data[i][yMin] = 0;
                    }
                    queryData('<', 0, function(negResults) {
                        //sort both by x
                        var pos = posResults.data.sort(function(a, b) {
                            return a[xAxis].localeCompare(b[xAxis]);
                        });
                        var neg = negResults.data.sort(function(a, b) {
                            return a[xAxis].localeCompare(b[xAxis]);
                        });

                        var i = 0;
                        var j = 0;
                        var total;

                        var positiveClass = "positive-bar";
                        var negativeClass = "negative-bar";

                        while(i < pos.length || j < neg.length) {
                            if(i < pos.length && j < neg.length) {
                                if(pos[i][xAxis] === neg[j][xAxis]) {
                                    //total
                                    total = pos[i][yField] + neg[j][yField];
                                    //1 -> 0-1
                                    pos[i][yMin] = 0;
                                    //2 -> 1-2
                                    neg[j][yMin] = pos[i][yField]; //FIXME there is an error causing the second bar height to be wrong
                                    neg[j][yField] = total;

                                    pos[i].classString = positiveClass;
                                    results.data.push(pos[i]);
                                    i++;
                                    neg[j].classString = negativeClass;
                                    results.data.push(neg[j]);
                                    j++;
                                } else {
                                    // push lesser x
                                    if(pos[i][xAxis].localeCompare(neg[j][xAxis]) < 0) {
                                        pos[i].classString = positiveClass;
                                        results.data.push(pos[i]);
                                        i++;
                                    } else {
                                        neg[j].classString = negativeClass;
                                        results.data.push(neg[j]);
                                        j++;
                                    }
                                }
                            } else {
                                if(i < pos.length) {
                                    pos[i].classString = positiveClass;
                                    results.data.push(pos[i]);
                                    i++;
                                } else {
                                    neg[j].classString = negativeClass;
                                    results.data.push(neg[j]);
                                    j++;
                                }
                            }
                        }

                        $scope.$apply(function() {
                            doDrawChart(results);
                        });
                    });
                });
            };

            var drawBlankChart = function() {
                doDrawChart({
                    data: []
                });
            };

            var doDrawChart = function(data) {
                charts.BarChart.destroy($element[0], '.barchart');

                var xAxis = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "x_axis") || $scope.options.attrX.columnName;
                var yAxis = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "y_axis") || $scope.options.attrY.columnName;
                if(!yAxis) {
                    yAxis = COUNT_FIELD_NAME;
                }
                var yMin = ($scope.options.barType ? COUNT_FIELD_NAME : yAxis) + "-min";

                var opts = {
                    data: data.data,
                    x: xAxis,
                    y: ($scope.options.barType ? COUNT_FIELD_NAME : yAxis),
                    yMin: yMin,
                    stacked: true,
                    responsive: false
                };
                (new charts.BarChart($element[0], '.barchart', opts)).draw();
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
