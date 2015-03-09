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

angular.module('neonDemo.directives')
.directive('countBy', ['ConnectionService', function(connectionService) {
    return {
        templateUrl: 'partials/directives/countby.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, el) {
            el.addClass('countByDirective');

            $scope.countField = "";
            $scope.count = 0;
            $scope.fields = [];
            $scope.tableId = 'query-results-' + uuid();
            $scope.filterKey = "countby-" + uuid();
            $scope.filterSet = undefined;
            $scope.errorMessage = undefined;

            var $tableDiv = $(el).find('.count-by-grid');
            $tableDiv.attr("id", $scope.tableId);

            /**
             * Updates the size of the table to fill the available space in the directive's area.
             * @method updateSize
             * @private
             */
            var updateSize = function() {
                // Subtract an additional 2 pixels from the table height to account for the its border.
                $('#' + $scope.tableId).height(el.height() - $(el).find('.count-by-header').outerHeight(true) - 2);
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
                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                $scope.$watch('countField', function() {
                    $scope.queryForData();
                });

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        $scope.messenger.removeFilter($scope.filterKey);
                    }
                });

                el.resize(function() {
                    updateSize();
                    if($scope.errorMessage) {
                        error.resizeErrorMessage(el, $scope.errorMessage);
                    }
                });

                // The header is resized whenever filtering is set or cleared.
                el.find('.count-by-header').resize(function() {
                    updateSize();
                });
            };

            function createOptions(data) {
                var options = {
                    data: data.data,
                    columns: createColumns(data.data),
                    gridOptions: {
                        forceFitColumns: true,
                        enableColumnReorder: true,
                        forceSyncScrolling: true
                    }
                };

                return options;
            }

            var createColumns = function(data) {
                var columns = tables.createColumns(data);
                for(var i = 0; i < columns.length; ++i) {
                    // Since forceFitColumns is enabled, setting this width will force the columns to use as much
                    // space as possible, which is necessary to keep the first column (dig) as small as possible.
                    columns[i].width = $tableDiv.outerWidth();
                }

                if(neon.DIG_ENABLED) {
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
             * Saves the given field and value as the current filter.
             * @param {String} The filter field
             * @param {String} The filter value
             */
            var handleSetFilter = function(field, value) {
                $scope.filterSet = {
                    key: field,
                    value: value
                };
            };

            /**
             * Clears the current filter.
             */
            var clearFilter = function() {
                $scope.filterSet = undefined;
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function() {
                $scope.queryForData();
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon dataset changed message.
             * @param {String} message.database The database that was selected.
             * @param {String} message.table The table within the database that was selected.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('CountBy- received neon dataset changed event');
                $scope.databaseName = message.database;
                $scope.tableName = message.table;

                // if there is no active connection, try to make one.
                connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);
                $scope.displayActiveDataset();
            };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function() {
                var connection = connectionService.getActiveConnection();
                if(connection) {
                    connectionService.loadMetadata(function() {
                        var info = connectionService.getActiveDataset();
                        $scope.databaseName = info.database;
                        $scope.tableName = info.table;
                        connection.getFieldNames($scope.tableName, function(results) {
                            $scope.$apply(function() {
                                $scope.fields = results;
                                $scope.queryForData();
                            });
                        });
                        $scope.queryForData();
                    });
                }
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
                if(!$scope.countField) {
                    return;
                }

                if($scope.errorMessage) {
                    error.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();
                if(connection) {
                    var query = $scope.buildQuery();

                    XDATA.activityLogger.logSystemActivity('CountBy - query for data');
                    connection.executeQuery(query, function(queryResults) {
                        $scope.$apply(function() {
                            XDATA.activityLogger.logSystemActivity('CountBy - received data');
                            $scope.updateData(queryResults);
                            XDATA.activityLogger.logSystemActivity('CountBy - rendered data');
                        });
                    }, function(response) {
                        XDATA.activityLogger.logSystemActivity('CountBy - query failed');
                        $scope.errorMessage = error.showErrorMessage(el, response.responseJSON.error, response.responseJSON.stackTrace);
                        $scope.updateData({
                            data: []
                        });
                    });
                }
            };

            $scope.stripIdField = function(dataObject) {
                var data = dataObject.data;

                var cleanData = [];
                for(var i = 0; i < data.length; i++) {
                    var row = {};
                    row[$scope.countField] = data[i][$scope.countField];
                    row.count = data[i].count;
                    cleanData.push(row);
                }
                dataObject.data = cleanData;
                return dataObject;
            };

            $scope.addDigUrlColumnData = function(data) {
                data.data.forEach(function(row) {
                    var field = $scope.countField;
                    var value = row[$scope.countField];
                    var query = $scope.countField + "=" + row[$scope.countField];
                    var element = "<form action=\"" + neon.DIG_SERVER + "/list\" method=\"get\" target=\"" + query + "\">" +
                        "<input type=\"hidden\" name=\"field\" value=\"" + field + "\">" +
                        "<input type=\"hidden\" name=\"value\" value=\"" + value + "\">" +
                        "<button class=\"hidden-button\" type=\"submit\" title=\"" + query + "\">" +
                        "<span class=\"glyphicon glyphicon-new-window\"></span></button></form>";
                    row.dig = element;
                });
                return data;
            };

            /**
             * Saves the given field and value as the current filter for the
             * dashboard and this widget.
             * @param {String} The filter field
             * @param {String} The filter value
             */
            $scope.setFilter = function(field, value) {
                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var filterClause = neon.query.where(field, '=', value);
                    var filter = new neon.query.Filter().selectFrom($scope.databaseName, $scope.tableName).where(filterClause);
                    if(!$scope.filterSet) {
                        $scope.messenger.addFilter($scope.filterKey, filter, function() {
                            handleSetFilter(field, value);
                        });
                    } else {
                        $scope.messenger.replaceFilter($scope.filterKey, filter, function() {
                            handleSetFilter(field, value);
                        });
                    }
                }
            };

            /**
             * Adds an onClick listener for selecting the rows in the table that
             * sets a filter on the data in the selected row.
             */
            $scope.addOnClickListener = function() {
                $scope.table.addOnClickListener(function(columns, row) {
                    var columnIndex = neon.DIG_ENABLED ? 1 : 0;
                    var field = columns[columnIndex].field;

                    // If the user clicks on the filtered row/cell, clear the filter.
                    if($scope.filterSet !== undefined) {
                        if($scope.filterSet.key === field && $scope.filterSet.value === row[field]) {
                            $scope.clearFilter();
                            return;
                        }
                    }

                    $tableDiv.addClass("filtered");
                    $scope.setFilter(field, row[field]);
                });
            };

            /**
             * Updates the data bound to the table managed by this directive.  This will trigger a change in
             * the chart's visualization.
             * @param {Object} queryResults Results returned from a Neon query.
             * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
             * @method updateData
             */
            $scope.updateData = function(queryResults) {
                var cleanData = $scope.stripIdField(queryResults);

                // If the table is recreated while sorting is set, we must redo the sorting on the new table.
                var sortInfo = $scope.table ? $scope.table.sortInfo_ : {};

                $scope.tableOptions = createOptions(cleanData);

                // Add the DIG URLs after the table options have been created because it already includes the column.
                if(neon.DIG_ENABLED) {
                    cleanData = $scope.addDigUrlColumnData(cleanData);
                }

                $scope.count = cleanData.data.length;
                $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();
                $scope.addOnClickListener();
                updateSize();

                if(sortInfo.hasOwnProperty("field") && sortInfo.hasOwnProperty("sortAsc")) {
                    $scope.table.sortColumnAndChangeGlyph(sortInfo);
                }

                // If the table is recreated while a filter is set, we must re-select the filtered row/cells.
                if($scope.filterSet !== undefined) {
                    $scope.table.setActiveCellIfMatchExists($scope.filterSet.key, $scope.filterSet.value);
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.tableName)
                .groupBy($scope.countField);

                // The widget displays its own ignored rows with 0.5 opacity.
                query.ignoreFilters([$scope.filterKey]);
                query.aggregate(neon.query.COUNT, '*', 'count');

                return query;
            };

            /**
             * Removes the current filter from the dashboard and this widget.
             */
            $scope.clearFilter = function() {
                if($scope.messenger) {
                    $scope.messenger.removeFilter($scope.filterKey, function() {
                        $tableDiv.removeClass("filtered");
                        $scope.table.deselect();
                        clearFilter();
                    });
                }
            };

            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset();
            });
        }
    };
}]);
