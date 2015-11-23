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
 * @namespace neonDemo.directives
 * @class queryResultsTable
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('queryResultsTable', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'ExportService', '$compile', '$interval', '$timeout',
function(external, popups, connectionService, datasetService, errorNotificationService, exportService, $compile, $interval, $timeout) {
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

            //FIXME sort column by sorted field
            //FIXME sort by field options
            //FIXME limit options
            //FIXME export
            //FIXME db and table?
            //FIXME themes
            //FIXME links
            //FIXMe external apps
            //FIXME userale
            //FIXME text selection on cells
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


            // /**
            //  * Event handler for filter changed events issued over Neon's messaging channels.
            //  * @param {Object} message A Neon filter changed message.
            //  * @method onFiltersChanged
            //  * @private
            //  */
            // var onFiltersChanged = function(message) {
            //     if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
            //         XDATA.userALE.log({
            //             activity: "alter",
            //             action: "query",
            //             elementId: "datagrid",
            //             elementType: "datagrid",
            //             elementSub: "datagrid",
            //             elementGroup: "chart_group",
            //             source: "system",
            //             tags: ["filter-change", "datagrid"]
            //         });
            //         queryForData(false);
            //     }
            // };

            // /**
            //  * Forces a data query regardless of the current need to query for data.
            //  * @method refreshData
            //  */
            // $scope.refreshData = function() {
            //     XDATA.userALE.log({
            //         activity: "perform",
            //         action: "click",
            //         elementId: "datagrid-refresh",
            //         elementType: "button",
            //         elementGroup: "table_group",
            //         source: "user",
            //         tags: ["options", "datagrid", "refresh"]
            //     });
            //     queryForData(false);
            // };

            /**
             * Triggers a Neon query that pull the a number of records that match the current Neon connection
             * and filter set.  The query will be limited by the record number and sorted by the field
             * selected in this directive's form.  This directive includes support for a show-data directive attribute
             * that binds to a scope variable and controls table display.  If the bound variable evaulates to false,
             * no data table is generated.  queryForData will not issue a query until the directive thinks it needs to
             * poll for data and should show data.
             * Resets internal "need to query" state to false.
             * @param {Boolean} refreshColumns Whether the columns should be refreshed and thus the
             * column ordering reverted back to the original
             * @method queryForData
             */
            // var queryForData = function(refreshColumns) {
            //     if($scope.errorMessage) {
            //         errorNotificationService.hideErrorMessage($scope.errorMessage);
            //         $scope.errorMessage = undefined;
            //     }

                // var connection = connectionService.getActiveConnection();

                // if(!connection) {
                //     $scope.updateData({
                //         data: []
                //     }, refreshColumns);
                //     $scope.totalRows = 0;
                //     $scope.loadingData = false;
                //     return;
                // }

                // var query = $scope.buildQuery();

            //     XDATA.userALE.log({
            //         activity: "alter",
            //         action: "query",
            //         elementId: "datagrid",
            //         elementType: "datagrid",
            //         elementSub: "data",
            //         elementGroup: "chart_group",
            //         source: "system",
            //         tags: ["query", "datagrid"]
            //     });

            //     if($scope.outstandingDataQuery) {
            //         $scope.outstandingDataQuery.abort();
            //     }

            //     $scope.outstandingDataQuery = connection.executeQuery(query);
            //     $scope.outstandingDataQuery.done(function() {
            //         $scope.outstandingDataQuery = undefined;
            //     });
            //     $scope.outstandingDataQuery.done(function(queryResults) {
            // //         XDATA.userALE.log({
            //             activity: "alter",
            //             action: "receive",
            //             elementId: "datagrid",
            //             elementType: "datagrid",
            //             elementSub: "data",
            //             elementGroup: "chart_group",
            //             source: "system",
            //             tags: ["receive", "datagrid"]
            //         });
            //         $scope.$apply(function() {
            //             $scope.updateData(queryResults, refreshColumns);
            //             queryForTotalRows(connection);
            //             XDATA.userALE.log({
            //                 activity: "alter",
            //                 action: "render",
            //                 elementId: "datagrid",
            //                 elementType: "datagrid",
            //                 elementSub: "data",
            //                 elementGroup: "chart_group",
            //                 source: "system",
            //                 tags: ["render", "datagrid"]
            //             });
            //         });
                // });
            //     $scope.outstandingDataQuery.fail(function(response) {
            //         if(response.status === 0) {
            //             XDATA.userALE.log({
            //                 activity: "alter",
            //                 action: "canceled",
            //                 elementId: "datagrid",
            //                 elementType: "datagrid",
            //                 elementSub: "data",
            //                 elementGroup: "chart_group",
            //                 source: "system",
            //                 tags: ["canceled", "datagrid"]
            //             });
            //         } else {
            //             XDATA.userALE.log({
            //                 activity: "alter",
            //                 action: "failed",
            //                 elementId: "datagrid",
            //                 elementType: "datagrid",
            //                 elementSub: "data",
            //                 elementGroup: "chart_group",
            //                 source: "system",
            //                 tags: ["failed", "datagrid"]
            //             });
            //             $scope.updateData({
            //                 data: []
            //             }, refreshColumns);
            //             $scope.totalRows = 0;
            //             $scope.loadingData = false;
            //             if(response.responseJSON) {
            //                 $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
            //             }
            //         }
            //     });
            // };

            // /**
            //  * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
            //  * @method queryForTotalRows
            //  */
            // var queryForTotalRows = function(connection) {
            //     var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name)
            //         .aggregate(neon.query.COUNT, '*', 'count');

            //     XDATA.userALE.log({
            //         activity: "alter",
            //         action: "query",
            //         elementId: "datagrid",
            //         elementType: "datagrid",
            //         elementSub: "totals",
            //         elementGroup: "chart_group",
            //         source: "system",
            //         tags: ["query", "datagrid"]
            //     });

            //     if($scope.outstandingTotalRowsQuery) {
            //         $scope.outstandingTotalRowsQuery.abort();
            //     }

            //     $scope.outstandingTotalRowsQuery = connection.executeQuery(query);
            //     $scope.outstandingTotalRowsQuery.always(function() {
            //         $scope.outstandingTotalRowsQuery = undefined;
            //     });
            //     $scope.outstandingTotalRowsQuery.done(function(queryResults) {
            //         $scope.$apply(function() {
            //             if(queryResults.data.length > 0) {
            //                 $scope.totalRows = queryResults.data[0].count;
            //             } else {
            //                 $scope.totalRows = 0;
            //             }
            //             $scope.loadingData = false;
            //             XDATA.userALE.log({
            //                 activity: "alter",
            //                 action: "receive",
            //                 elementId: "datagrid",
            //                 elementType: "datagrid",
            //                 elementSub: "totals",
            //                 elementGroup: "chart_group",
            //                 source: "system",
            //                 tags: ["receive", "datagrid"]
            //             });
            //         });
            //     });
            //     $scope.outstandingTotalRowsQuery.fail(function(response) {
            //         if(response.status === 0) {
            //             XDATA.userALE.log({
            //                 activity: "alter",
            //                 action: "canceled",
            //                 elementId: "datagrid",
            //                 elementType: "datagrid",
            //                 elementSub: "totals",
            //                 elementGroup: "chart_group",
            //                 source: "system",
            //                 tags: ["canceled", "datagrid"]
            //             });
            //         } else {
            //             XDATA.userALE.log({
            //                 activity: "alter",
            //                 action: "failed",
            //                 elementId: "datagrid",
            //                 elementType: "datagrid",
            //                 elementSub: "totals",
            //                 elementGroup: "chart_group",
            //                 source: "system",
            //                 tags: ["failed", "datagrid"]
            //             });
            //             $scope.totalRows = 0;
            //             $scope.loadingData = false;
            //         }
            //     });
            // };

            // /**
            //  * Adds an onClick listener for selecting a row in the table that
            //  * publishes the row to a channel
            //  */
            // $scope.addOnClickListener = function() {
            //     $scope.table.addOnClickListener(function(columns, row) {
            //         // Deselect the row if already selected
            //         if($scope.selectedRowId !== undefined && $scope.selectedRowId === row._id) {
            //             XDATA.userALE.log({
            //                 activity: "deselect",
            //                 action: "click",
            //                 elementId: "row",
            //                 elementType: "datagrid",
            //                 elementGroup: "table_group",
            //                 source: "user",
            //                 tags: ["datagrid", "row"]
            //             });

            //             $scope.clearSelection();
            //             return;
            //         }

            //         $scope.$apply(function() {
            //             XDATA.userALE.log({
            //                 activity: "select",
            //                 action: "click",
            //                 elementId: "row",
            //                 elementType: "datagrid",
            //                 elementGroup: "table_group",
            //                 source: "user",
            //                 tags: ["datagrid", "row"]
            //             });

            //             $scope.messenger.publish($scope.selectionEvent, {
            //                 data: row,
            //                 database: $scope.options.database.name,
            //                 table: $scope.options.table.name
            //             });
            //             $tableDiv.addClass("row-selected");
            //             $scope.selectedRowId = row._id;
            //         });
            //     });
            // };

            // /**
            //  * Adds a sort listener in order to clear any row selection on column reorders
            //  */
            // $scope.addSortListener = function() {
            //     $scope.table.registerSortListener(function() {
            //         XDATA.userALE.log({
            //             activity: "deselect",
            //             action: "click",
            //             elementId: "row",
            //             elementType: "datagrid",
            //             elementGroup: "table_group",
            //             source: "system",
            //             tags: ["datagrid", "row"]
            //         });

            //         $scope.clearSelection();
            //     });
            // };

            // $scope.clearSelection = function() {
            //     $scope.messenger.publish($scope.selectionEvent, {});
            //     $scope.selectedRowId = undefined;
            //     $tableDiv.removeClass("row-selected");

            //     // Delay deselection or the row won't deselect
            //     $timeout(function() {
            //         $scope.table.deselect();
            //     }, 100);
            // };

            // /**
            //  * Updates the data bound to the table managed by this directive.  This will trigger a change in
            //  * the chart's visualization.
            //  * @param {Object} queryResults Results returned from a Neon query.
            //  * @param {Array} queryResults.data The aggregate numbers for the heat chart cells.
            //  * @param {Boolean} refreshColumns Whether the columns should be refreshed and thus the
            //  * column ordering reverted back to the original
            //  * @method updateData
            //  */
            // $scope.updateData = function(queryResults, refreshColumns) {
            //     if(!($("#" + $scope.tableId).length)) {
            //         return;
            //     }

            //     $scope.tableOptions = $scope.createOptions(queryResults, refreshColumns);

            //     if(external.anyEnabled) {
            //         queryResults = $scope.addExternalAppUrlColumnData(queryResults);
            //     }

            //     $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();

            //     /* Enable row selection
            //      * Limitations:
            //      *  - It is only guaranteed to work correctly if there is only one data table showing this collection
            //      */
            //     if($scope.options.table.enableRowSelection) {
            //         $(".query-results-grid .slick-row").addClass("selectable");
            //         $scope.addOnClickListener();
            //         $scope.clearSelection();
            //         $scope.addSortListener();
            //     }

            //     $scope.table.refreshLayout();

            //     // Set the displayed link data for the links popup for the application using the source and index stored in to the triggering button.
            //     $(".links-popup").on("show.bs.modal", function(event) {
            //         var button = $(event.relatedTarget);
            //         var source = button.data("links-source");
            //         var index = button.data("links-index");
            //         $scope.$apply(function() {
            //             popups.links.setView(source, index);
            //         });
            //     });
            //     $scope.table.addOnColumnsReorderedListener($scope.createDeleteColumnButtons);
            //     $scope.createDeleteColumnButtons();
            // };

            // $scope.addExternalAppUrlColumnData = function(data) {
            //     var tableLinks = [];

            //     data.data.forEach(function(row) {
            //         var id = row._id;
            //         var query = "id=" + id;

            //         var links = [];

            //         if(external.dig.enabled) {
            //             links.push($scope.createLinkObject(external.dig, id, query));
            //         }

            //         var linksIndex = tableLinks.length;
            //         tableLinks.push(links);

            //         row[$scope.EXTERNAL_APP_FIELD_NAME] = "<a data-toggle=\"modal\" data-target=\".links-popup\" data-links-index=\"" + linksIndex +
            //             "\" data-links-source=\"" + $scope.tableId + "\" class=\"collapsed dropdown-toggle primary neon-popup-button\">" +
            //             "<span class=\"glyphicon glyphicon-link\"></span></a>";
            //     });

            //     // Set the link data for the links popup for this visualization.
            //     popups.links.setData($scope.tableId, tableLinks);

            //     return data;
            // };

            // $scope.createLinkObject = function(config, id, query) {
            //     var link = {
            //         name: config.data_table.name,
            //         image: config.data_table.image,
            //         url: config.data_table.url,
            //         args: [],
            //         data: {
            //             server: config.server,
            //             value: id,
            //             query: query
            //         }
            //     };

            //     for(var i = 0; i < config.data_table.args.length; ++i) {
            //         var arg = config.data_table.args[i];
            //         link.args.push({
            //             name: arg.name,
            //             value: arg.value
            //         });
            //     }

            //     return link;
            // };

            // $scope.createDeleteColumnButtons = function() {
            //     $element.find(".slick-header-column").each(function() {
            //         var name = $(this).find(".slick-column-name").html();
            //         // Check if the name is empty to ignore the external application link column.
            //         if(name) {
            //             $(this).append($compile($scope.createDeleteColumnButton(name))($scope));
            //         }
            //     });
            // };

            // $scope.createDeleteColumnButton = function(name) {
            //     return "<span class=\"remove-column-button\" ng-click=\"deleteColumn('" + name + "'); $event.stopPropagation();\">&times;</span>";
            // };

            // $scope.deleteColumn = function(name) {
            //     if($scope.table.deleteColumn(name)) {
            //         var indexToSplice = _.findIndex($scope.fields, function(field) {
            //             return name === field.prettyName;
            //         });
            //         var deletedField = $scope.fields.splice(indexToSplice, 1)[0];
            //         $scope.options.sortByField = $scope.options.sortByField === name ? $scope.fields[0] : $scope.options.sortByField;
            //         $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].push(deletedField);
            //         $scope.options.addField = deletedField;
            //         $scope.createDeleteColumnButtons();

            //         XDATA.userALE.log({
            //             activity: "remove",
            //             action: "click",
            //             elementId: "column-" + name,
            //             elementType: "datagrid",
            //             elementGroup: "table_group",
            //             source: "user",
            //             tags: ["options", "datagrid", "column", name]
            //         });
            //     }
            // };

            // $scope.addColumn = function() {
            //     if($scope.table.addColumn($scope.options.addField.prettyName)) {
            //         var indexToSplice = _.findIndex($scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name], function(deletedField) {
            //             return deletedField.columnName === $scope.options.addField.columnName;
            //         });
            //         $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].splice(indexToSplice, 1);
            //         $scope.fields.push($scope.options.addField);
            //         $scope.options.addField = $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name].length > 0 ? $scope.deletedFieldsMap[$scope.options.database.name][$scope.options.table.name][0] : {
            //             columnName: "",
            //             prettyName: ""
            //         };
            //         $scope.createDeleteColumnButtons();

            //         XDATA.userALE.log({
            //             activity: "add",
            //             action: "click",
            //             elementId: "column-" + $scope.options.addField.prettyName,
            //             elementType: "datagrid",
            //             elementGroup: "table_group",
            //             source: "user",
            //             tags: ["options", "datagrid", "column", $scope.options.addField.prettyName]
            //         });
            //     }
            // };

            // /**
            //  * Builds a query to pull a limited set of records that match any existing filter sets.
            //  * @return neon.query.Query
            //  * @method buildQuery
            //  */
            // $scope.buildQuery = function() {
            //     var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).limit($scope.options.limit);
            //     if($scope.options.sortByField && $scope.options.sortByField.columnName) {
            //         query.sortBy($scope.options.sortByField.columnName, $scope.options.sortDirection);
            //     }
            //     return query;
            // };

            // $scope.handleAscButtonClick = function() {
            //     if($scope.options.sortDirection === $scope.ASCENDING) {
            //         $scope.refreshData();
            //     }
            // };

            // $scope.handleDescButtonClick = function() {
            //     if($scope.options.sortDirection === $scope.DESCENDING) {
            //         $scope.refreshData();
            //     }
            // };

            // /**
            //  * Creates and returns an object that contains information needed to export the data in this widget.
            //  * @return {Object} An object containing all the information needed to export the data in this widget.
            //  */
            // $scope.makeQueryResultsTableExportObject = function() {
            //     XDATA.userALE.log({
            //         activity: "perform",
            //         action: "click",
            //         elementId: "datagrid-export",
            //         elementType: "button",
            //         elementGroup: "table_group",
            //         source: "user",
            //         tags: ["options", "datagrid", "export"]
            //     });
            //     var query = $scope.buildQuery();
            //     query.limitClause = exportService.getLimitClause();
            //     var finalObject = {
            //         name: "Query_Results_Table",
            //         data: [{
            //             query: query,
            //             name: "queryResultsTable-" + $scope.exportID,
            //             fields: [],
            //             ignoreFilters: query.ignoreFilters_,
            //             selectionOnly: query.selectionOnly_,
            //             ignoredFilterIds: query.ignoredFilterIds_,
            //             type: "query"
            //         }]
            //     };
            //     var addField = function(field) {
            //         finalObject.data[0].fields.push({
            //             query: field.columnName,
            //             pretty: field.prettyName || field.columnName
            //         });
            //     };
            //     datasetService.getFields($scope.options.database.name, $scope.options.table.name).forEach(addField);
            //     return finalObject;
            // };

            // // Wait for neon to be ready, the create our messenger and intialize the view and data.
            // neon.ready(function() {
            //     $scope.initialize();
            //     $scope.displayActiveDataset(true);
            // });