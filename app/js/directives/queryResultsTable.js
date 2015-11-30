'use strict';
/*
 * Copyright 2015 Next Century Corporation
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
 * This Angular JS directive adds a data table to a page showing the records that match the current
 * filter set.
 *
 * @example
 *    &lt;query-results-table&gt;&lt;/query-results-table&gt;<br>
 *    &lt;div query-results-table&gt;&lt;/div&gt;
 *
 * @namespace neonDemo.directives
 * @class queryResultsTable
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('queryResultsTable', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', 'linkify', '$sce', '$timeout',
function(external, popups, connectionService, datasetService, errorNotificationService, exportService, linkify, $sce, $timeout) {
    return {
        templateUrl: 'partials/directives/queryResultsTable.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        controller: function($scope) {
            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            $scope.gridOptions = {
                columnDefs: [],
                rowData: [],
                rowSelection: 'multiple',
                rowDeselection: true,
                enableColResize: true,
                enableSorting: true,
                showToolPanel: false,
                toolPanelSuppressPivot: true,
                toolPanelSuppressValues: true
            };

            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, $scope.queryForData);
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                initializeDataset();

                queryForTotalRows();
                updateFields();
                $scope.queryForData();
            };

            var initializeDataset = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.active = {
                    database: $scope.databases[0]
                };
                $scope.tables = datasetService.getTables($scope.active.database.name);
                $scope.active.table = $scope.tables[0];

                $scope.active.limit = 5000;
            };

            var updateFields = function() {
                $scope.fields = getFields();

                $scope.active.sortByField = $scope.fields[0];
                $scope.active.sortDirection = neon.query.ASCENDING;

                var columnDefs = _.map($scope.fields, function(field) {
                    return {
                        headerName: field.prettyName,
                        field: field.columnName,
                        suppressSizeToFit: true //TODO not if fixed width table
                    };
                });

                $scope.gridOptions.api.setColumnDefs(columnDefs);

                updateColumnSizes();
            };

            var getFields = function() {
                return datasetService.getFields($scope.active.database.name, $scope.active.table.name);
            };

            var updateColumnSizes = function() {
                $scope.gridOptions.api.sizeColumnsToFit();
            };

            $scope.queryForData = function() {
                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    updateData([]);
                    return;
                }

                var query = buildQuery();

                if($scope.outstandingDataQuery) {
                    $scope.outstandingDataQuery.abort();
                }

                $scope.outstandingDataQuery = connection.executeQuery(query);
                $scope.outstandingDataQuery.done(function() {
                    $scope.outstandingDataQuery = undefined;
                });
                $scope.outstandingDataQuery.done(function(queryResults) {
                    updateData(queryResults.data);
                });
                $scope.outstandingDataQuery.fail(function(response) {
                    updateData([]);
                });
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            var buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name).limit($scope.active.limit);
                if($scope.active.sortByField && $scope.active.sortByField.columnName) {
                    query.sortBy($scope.active.sortByField.columnName, $scope.active.sortDirection);
                }
                return query;
            };

            var updateData = function(data) {
                $scope.active.count = data.length;
                $scope.gridOptions.api.setRowData(data);
                $timeout(function() {
                    linkifyRows(data);
                });
            };

            var linkifyRows = function(data) {
                var linkedData = _.map(data, function(row) {
                    _.each(row, function(value, key) {
                        if(value && typeof value === 'string') {
                            row[key] = $sce.trustAsHtml(linkify.twitter(value));
                        }
                    });

                    return row;
                });

                $scope.gridOptions.api.setRowData(linkedData);
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.active.database.name && message.addedFilter.tableName === $scope.active.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "datagrid",
                        elementType: "datagrid",
                        elementSub: "datagrid",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "datagrid"]
                    });
                    $scope.queryForData();
                }
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForTotalRows
             */
            var queryForTotalRows = function() {
                var connection = connectionService.getActiveConnection();

                if(!connection) {
                    updateData([]);
                    return;
                }

                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name)
                .aggregate(neon.query.COUNT, '*', 'count');

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "datagrid",
                    elementType: "datagrid",
                    elementSub: "totals",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "datagrid"]
                });

                if($scope.outstandingTotalRowsQuery) {
                    $scope.outstandingTotalRowsQuery.abort();
                }

                $scope.outstandingTotalRowsQuery = connection.executeQuery(query);
                $scope.outstandingTotalRowsQuery.always(function() {
                    $scope.outstandingTotalRowsQuery = undefined;
                });
                $scope.outstandingTotalRowsQuery.done(function(queryResults) {
                    $scope.$apply(function() {
                        if(queryResults.data.length > 0) {
                            $scope.active.totalRows = queryResults.data[0].count;
                        } else {
                            $scope.active.totalRows = 0;
                        }
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "totals",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "datagrid"]
                        });
                    });
                });
                $scope.outstandingTotalRowsQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "totals",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["canceled", "datagrid"]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "totals",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "datagrid"]
                        });
                        $scope.active.totalRows = 0;
                    }
                });
            };

            $scope.toggleToolbox = function() {
                $scope.gridOptions.showToolPanel = !$scope.gridOptions.showToolPanel;
                $scope.gridOptions.api.showToolPanel($scope.gridOptions.showToolPanel);
            };

            $scope.updateSort = function(direction) {
                var sort = {
                    colId: $scope.active.sortByField.columnName,
                };
                if(direction && direction === 'asc') {
                    sort.sort = 'asc';
                } else if(direction) {
                    sort.sort = 'desc';
                } else {
                    sort.sort = ($scope.active.sortDirection === 1 ? 'asc' : 'desc');
                }

                $scope.gridOptions.api.setSortModel([sort]);

                $scope.queryForData();
            };

            //FIXME export
            //FIXME db and table?
            //FIXME themes
            //FIXMe external apps
            //FIXME userale

            //FIXME text selection on cells -- https://github.com/ceolter/ag-grid/issues/87
        },
        link: function($scope, $element) {
            $element.addClass('query-results-directive');

            $scope.element = $element;

            //Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.init();
            });
        }
    };
}]);