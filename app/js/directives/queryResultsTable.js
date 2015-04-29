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
 * This Angular JS directive adds a data table to a page showing the records that match the current
 * filter set.
 *
 * @example
 *    &lt;query-results-table&gt;&lt;/query-results-table&gt;<br>
 *    &lt;div query-results-table&gt;&lt;/div&gt;
 *
 * @class neonDemo.directives.queryResultsTable
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('queryResultsTable', ['DIG', 'ConnectionService', 'DatasetService', 'ErrorNotificationService',
    function(DIG, connectionService, datasetService, errorNotificationService) {
    return {
        templateUrl: 'partials/directives/queryResultsTable.html',
        restrict: 'EA',
        scope: {
            navbarItem: '=?',
            showData: '=?'
        },
        link: function($scope, element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $(element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            element.addClass('query-results-directive');

            // If this widget was launched as a navbar collapsable then showData will be bound to the collapse toggle.
            // Otherwise show the data automatically on launching the widget.
            if(typeof($scope.showData) === "undefined") {
                $scope.showData = true;
                element.resize(function() {
                    updateSize();
                });
            }

            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            $scope.databaseName = '';
            $scope.tables = [];
            $scope.selectedTable = {
                name: ""
            };
            $scope.fields = [];
            $scope.sortByField = '';
            $scope.sortDirection = neon.query.ASCENDING;
            $scope.limit = 500;
            $scope.totalRows = 0;
            $scope.errorMessage = undefined;

            // Default our data table to be empty.  Generate a unique ID for it
            // and pass that to the tables.Table object.
            $scope.data = [];
            $scope.tableId = 'query-results-' + uuid();
            var $tableDiv = $(element).find('.query-results-grid');

            $tableDiv.attr("id", $scope.tableId);

            var updateSize = function() {
                var margin = $tableDiv.outerHeight(true) - $tableDiv.height();
                $tableDiv.height(element.height() - $(element).find('.count-header').outerHeight(true) - margin);
                if($scope.table) {
                    $scope.table.refreshLayout();
                }
            };

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             */
            $scope.initialize = function() {
                // KLUDGE: Watch for changes to showData if it goes from false to true, we want to requery for data to
                // trigger the data table to be recreated.  While deferring data queries to when the user want to display them
                // is benefitial for initial application load, it can interfere with animations tied to whether or not this is
                // displayed.  The other reason to query for data on show is because of issues with SlickGrid.  It does not
                // display proper scrolling and sizing behavior if it is rendered while not visible.
                $scope.$watch('showData', function(newVal) {
                    if(newVal) {
                        $scope.queryForData();
                    }
                });

                $scope.$watch('sortByField', function(newVal, oldVal) {
                    XDATA.activityLogger.logUserActivity('DataView - user set database level sorting field', 'select_filter_menu_option',
                        XDATA.activityLogger.WF_GETDATA,
                        {
                            from: oldVal,
                            to: newVal
                        });
                });

                $scope.$watch('sortDirection', function(newVal, oldVal) {
                    XDATA.activityLogger.logUserActivity('DataView - user set database level sorting direction', 'select_filter_menu_option',
                        XDATA.activityLogger.WF_GETDATA,
                        {
                            from: oldVal,
                            to: newVal
                        });
                });

                $scope.$watch('limit', function(newVal, oldVal) {
                    XDATA.activityLogger.logUserActivity('DataView - user set max rows to pull from database', 'enter_filter_text',
                        XDATA.activityLogger.WF_GETDATA,
                        {
                            from: oldVal,
                            to: newVal
                        });
                });

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });
            };

            $scope.createOptions = function(data) {
                var _id = "_id";
                var has_id = true;

                _.each(data.data, function(element) {
                    if(!(_.has(element, _id))) {
                        has_id = false;
                    }
                });

                var options = {
                    data: data.data,
                    columns: createColumns(data.data),
                    gridOptions: {
                        enableTextSelectionOnCells: true,
                        forceFitColumns: false,
                        enableColumnReorder: true,
                        forceSyncScrolling: true
                    }
                };

                if(has_id) {
                    options.id = _id;
                }
                return options;
            };

            var createColumns = function(data) {
                var columns = tables.createColumns(data);
                columns = tables.addLinkabilityToColumns(columns);

                if(DIG.enabled) {
                    var digColumn = {
                        name: "",
                        field: "dig",
                        width: "15",
                        cssClass: "centered",
                        ignoreClicks: true
                    };
                    columns.splice(0, 0, digColumn);
                }

                return columns;
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('DataView - received neon filter changed event');
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.selectedTable.name) {
                    updateRowsAndCount();
                }
            };

            /**
             * Updates the data and the count of total rows in the data
             */
            var updateRowsAndCount = function() {
                $scope.queryForTotalRows();
                $scope.queryForData();
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('DataView - received neon-gtd dataset changed event');
                $scope.displayActiveDataset(false);
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.selectedTable = $scope.tables[0];

                if(initializing) {
                    $scope.updateFieldsAndRowsAndCount();
                } else {
                    $scope.$apply(function() {
                        $scope.updateFieldsAndRowsAndCount();
                    });
                }
            };

            $scope.updateFieldsAndRowsAndCount = function() {
                $scope.fields = datasetService.getDatabaseFields($scope.selectedTable.name);
                $scope.sortByField = datasetService.getMapping($scope.selectedTable.name, "sort_by") || $scope.fields[0];
                updateRowsAndCount();
            };

            /**
             * Forces a data query regardless of the current need to query for data.
             * @method refreshData
             */
            $scope.refreshData = function() {
                XDATA.activityLogger.logUserActivity('DataView - user requested table refresh', 'execute_query_filter',
                    XDATA.activityLogger.WF_GETDATA);
                $scope.queryForData();
            };

            /**
             * Triggers a Neon query that pull the a number of records that match the current Neon connection
             * and filter set.  The query will be limited by the record number and sorted by the field
             * selected in this directive's form.  This directive includes support for a show-data directive attribute
             * that binds to a scope variable and controls table display.  If the bound variable evaulates to false,
             * no data table is generated.  queryForData will not issue a query until the directive thinks it needs to
             * poll for data and should show data.
             * Resets internal "need to query" state to false.
             * @method queryForData
             */
            $scope.queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                if($scope.showData) {
                    var connection = connectionService.getActiveConnection();
                    if(connection) {
                        var query = $scope.buildQuery();

                        XDATA.activityLogger.logSystemActivity('DataView - query for data');
                        connection.executeQuery(query, function(queryResults) {
                            XDATA.activityLogger.logSystemActivity('DataView - received data');
                            $scope.$apply(function() {
                                $scope.updateData(queryResults);
                                XDATA.activityLogger.logSystemActivity('DataView - rendered data');
                            });
                        }, function(response) {
                            XDATA.activityLogger.logSystemActivity('DataView - received error in query for data');
                            $scope.updateData({
                                data: []
                            });
                            if(response.responseJSON) {
                                $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);
                            }
                        });
                    }
                }
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForData
             */
            $scope.queryForTotalRows = function() {
                var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.selectedTable.name)
                    .aggregate(neon.query.COUNT, '*', 'count');

                XDATA.activityLogger.logSystemActivity('DataView - query for total rows of data');
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connection.executeQuery(query, function(queryResults) {
                        $scope.$apply(function() {
                            if(queryResults.data.length > 0) {
                                $scope.totalRows = queryResults.data[0].count;
                            } else {
                                $scope.totalRows = 0;
                            }
                            XDATA.activityLogger.logSystemActivity('DataView - received total; updating view');
                        });
                    }, function() {
                        XDATA.activityLogger.logSystemActivity('DataView - received error in query for total rows');
                        $scope.totalRows = 0;
                    });
                }
            };

            /**
             * Refresh query forces a fresh query for data given the current sorting and limiting selections.
             * @method refreshQuery
             */

            /**
             * Updates the data bound to the table managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method updateData
             */
            $scope.updateData = function(queryResults) {
                if(!($("#" + $scope.tableId).length)) {
                    return;
                }

                $scope.tableOptions = $scope.createOptions(queryResults);

                if(DIG.enabled) {
                    queryResults = $scope.addDigUrlColumnData(queryResults);
                }

                $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();
                $scope.table.refreshLayout();
            };

            $scope.addDigUrlColumnData = function(data) {
                data.data.forEach(function(row) {
                    var rowId = row._id;
                    var query = "id=" + rowId;
                    var element = "<form action=\"" + DIG.server + "/list\" method=\"get\" target=\"" + query + "\">" +
                        "<input type=\"hidden\" name=\"id\" value=\"" + rowId + "\">" +
                        "<button class=\"hidden-button\" type=\"submit\" title=\"" + query + "\">" +
                        "<span class=\"glyphicon glyphicon-new-window\"></span></button></form>";
                    row.dig = element;
                });
                return data;
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.selectedTable.name);
                query.limit($scope.limit);
                if($scope.sortByField !== "undefined" && $scope.sortByField.length > 0) {
                    query.sortBy($scope.sortByField, $scope.sortDirection);
                }

                return query;
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
