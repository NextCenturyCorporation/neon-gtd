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
.directive('queryResultsTable', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', '$compile',
function(external, popups, connectionService, datasetService, errorNotificationService, $compile) {
    return {
        templateUrl: 'partials/directives/queryResultsTable.html',
        restrict: 'EA',
        scope: {
            bindTable: '=',
            bindDatabase: '=',
            navbarItem: '=?',
            showData: '=?',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('query-results-directive');

            $scope.element = $element;

            // Unique field name used for the SlickGrid column containing the URLs for the external apps.
            // This name should be one that is highly unlikely to be a column name in a real database.
            $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

            var updateSize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                var tableBufferY = $tableDiv.outerHeight(true) - $tableDiv.height();
                $tableDiv.height($element.height() - headerHeight - tableBufferY);
                if($scope.table) {
                    $scope.table.refreshLayout();
                }
            };

            // If this widget was launched as a navbar collapsable then showData will be bound to the collapse toggle.
            // Otherwise show the data automatically on launching the widget.
            if($scope.showData === undefined) {
                $scope.showData = true;
                $element.resize(updateSize);
            }

            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.tableNameToDeletedFieldsMap = {};
            $scope.totalRows = 0;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.options = {
                database: {},
                table: {},
                addField: "",
                sortByField: "",
                sortDirection: neon.query.ASCENDING,
                limit: 500
            };

            // Default our data table to be empty.  Generate a unique ID for it
            // and pass that to the tables.Table object.
            $scope.data = [];
            $scope.tableId = 'query-results-' + uuid();
            var $tableDiv = $element.find('.query-results-grid');
            $tableDiv.attr("id", $scope.tableId);

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
                        queryForData();
                    }
                });

                $scope.$watch('options.sortByField', function(newVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: "datagrid-sort-by",
                        elementType: "combobox",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "sort-by", newVal]
                    });
                });

                $scope.$watch('options.sortDirection', function(newVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: "datagrid-sort-direction",
                        elementType: "radiobutton",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "sort-direction", newVal]
                    });
                });

                $scope.$watch('options.limit', function(newVal) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "keydown",
                        elementId: "datagrid-limit",
                        elementType: "textbox",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "limit", newVal]
                    });
                });

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "datagrid",
                        elementType: "canvas",
                        elementSub: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["remove", "datagrid"]
                    });
                    popups.links.deleteData($scope.tableId);
                    $element.off("resize", updateSize);
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
                var columns = tables.createColumns(data, $scope.tableNameToDeletedFieldsMap[$scope.options.table.name], [$scope.createDeleteColumnButton("")]);
                columns = tables.addLinkabilityToColumns(columns);

                if(external.anyEnabled) {
                    var externalAppColumn = {
                        name: "",
                        field: $scope.EXTERNAL_APP_FIELD_NAME,
                        width: "15",
                        cssClass: "centered",
                        ignoreClicks: true
                    };
                    columns.splice(0, 0, externalAppColumn);
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
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    queryForData();
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                        }
                    }
                }

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
                $scope.options.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                        }
                    }
                }
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();
                $scope.options.addField = "";
                if(!($scope.tableNameToDeletedFieldsMap[$scope.options.table.name])) {
                    $scope.tableNameToDeletedFieldsMap[$scope.options.table.name] = [];
                }
                if($scope.tableNameToDeletedFieldsMap[$scope.options.table.name].length) {
                    // Remove previously deleted fields from the list of fields.
                    $scope.fields = $scope.fields.filter(function(field) {
                        return $scope.tableNameToDeletedFieldsMap[$scope.options.table.name].indexOf(field) === -1;
                    });
                    $scope.options.addField = $scope.tableNameToDeletedFieldsMap[$scope.options.table.name][0];
                }
                $scope.options.sortByField = datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "sort_by") || $scope.fields[0];
                queryForData();
            };

            /**
             * Forces a data query regardless of the current need to query for data.
             * @method refreshData
             */
            $scope.refreshData = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "datagrid-refresh",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "datagrid", "refresh"]
                });
                queryForData();
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
            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.showData) {
                    $scope.updateData({
                        data: []
                    });
                    $scope.totalRows = 0;
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "datagrid",
                    elementType: "datagrid",
                    elementSub: "data",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "datagrid"]
                });

                connection.executeQuery(query, function(queryResults) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: "datagrid",
                        elementType: "datagrid",
                        elementSub: "data",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["receive", "datagrid"]
                    });
                    $scope.$apply(function() {
                        $scope.updateData(queryResults);
                        queryForTotalRows(connection);
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "datagrid",
                            elementType: "datagrid",
                            elementSub: "data",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["render", "datagrid"]
                        });
                    });
                }, function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "datagrid",
                        elementType: "datagrid",
                        elementSub: "data",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["failed", "datagrid"]
                    });
                    $scope.updateData({
                        data: []
                    });
                    $scope.totalRows = 0;
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Triggers a Neon query that will aggregate the time data for the currently selected dataset.
             * @method queryForTotalRows
             */
            var queryForTotalRows = function(connection) {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name)
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

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        if(queryResults.data.length > 0) {
                            $scope.totalRows = queryResults.data[0].count;
                        } else {
                            $scope.totalRows = 0;
                        }
                        $scope.loadingData = false;
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
                }, function() {
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
                    $scope.totalRows = 0;
                    $scope.loadingData = false;
                });
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

                if(external.anyEnabled) {
                    queryResults = $scope.addExternalAppUrlColumnData(queryResults);
                }

                $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();
                $scope.table.refreshLayout();

                // Set the displayed link data for the links popup for the application using the source and index stored in to the triggering button.
                $(".links-popup").on("show.bs.modal", function(event) {
                    var button = $(event.relatedTarget);
                    var source = button.data("links-source");
                    var index = button.data("links-index");
                    $scope.$apply(function() {
                        popups.links.setView(source, index);
                    });
                });
                $scope.table.addOnColumnsReorderedListener($scope.createDeleteColumnButtons);
                $scope.createDeleteColumnButtons();
            };

            $scope.addExternalAppUrlColumnData = function(data) {
                var tableLinks = [];

                data.data.forEach(function(row) {
                    var id = row._id;
                    var query = "id=" + id;

                    var links = [];

                    if(external.dig.enabled) {
                        links.push($scope.createLinkObject(external.dig, id, query));
                    }

                    var linksIndex = tableLinks.length;
                    tableLinks.push(links);

                    row[$scope.EXTERNAL_APP_FIELD_NAME] = "<a data-toggle=\"modal\" data-target=\".links-popup\" data-links-index=\"" + linksIndex +
                        "\" data-links-source=\"" + $scope.tableId + "\" class=\"collapsed dropdown-toggle primary neon-popup-button\">" +
                        "<span class=\"glyphicon glyphicon-link\"></span></a>";
                });

                // Set the link data for the links popup for this visualization.
                popups.links.setData($scope.tableId, tableLinks);

                return data;
            };

            $scope.createLinkObject = function(config, id, query) {
                var link = {
                    name: config.data_table.name,
                    image: config.data_table.image,
                    url: config.data_table.url,
                    args: [],
                    data: {
                        server: config.server,
                        value: id,
                        query: query
                    }
                };

                for(var i = 0; i < config.data_table.args.length; ++i) {
                    var arg = config.data_table.args[i];
                    link.args.push({
                        name: arg.name,
                        value: arg.value
                    });
                }

                return link;
            };

            $scope.createDeleteColumnButtons = function() {
                $element.find(".slick-header-column").each(function() {
                    var name = $(this).find(".slick-column-name").html();
                    // Check if the name is empty to ignore the external application link column.
                    if(name) {
                        $(this).append($compile($scope.createDeleteColumnButton(name))($scope));
                    }
                });
            };

            $scope.createDeleteColumnButton = function(name) {
                return "<span class=\"remove-column-button\" ng-click=\"deleteColumn('" + name + "'); $event.stopPropagation();\">&times;</span>";
            };

            $scope.deleteColumn = function(name) {
                if($scope.table.deleteColumn(name)) {
                    var indexToSplice = $scope.fields.indexOf(name);
                    $scope.fields.splice(indexToSplice, 1);
                    $scope.options.sortByField = $scope.options.sortByField === name ? $scope.fields[0] : $scope.options.sortByField;
                    $scope.tableNameToDeletedFieldsMap[$scope.options.table.name].push(name);
                    $scope.options.addField = name;
                    $scope.createDeleteColumnButtons();

                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "column-" + name,
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "column", name]
                    });
                }
            };

            $scope.addColumn = function() {
                if($scope.table.addColumn($scope.options.addField)) {
                    var indexToSplice = $scope.tableNameToDeletedFieldsMap[$scope.options.table.name].indexOf($scope.options.addField);

                    XDATA.userALE.log({
                        activity: "add",
                        action: "click",
                        elementId: "column-" + $scope.options.addField,
                        elementType: "datagrid",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["options", "datagrid", "column", $scope.options.addField]
                    });
                    $scope.tableNameToDeletedFieldsMap[$scope.options.table.name].splice(indexToSplice, 1);
                    $scope.fields.push($scope.options.addField);
                    $scope.options.addField = $scope.tableNameToDeletedFieldsMap[$scope.options.table.name].length > 0 ? $scope.tableNameToDeletedFieldsMap[$scope.options.table.name][0] : "";
                    $scope.createDeleteColumnButtons();
                }
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).limit($scope.options.limit);
                if($scope.options.sortByField !== undefined && $scope.options.sortByField.length > 0) {
                    query.sortBy($scope.options.sortByField, $scope.options.sortDirection);
                }
                return query;
            };

            $scope.handleAscButtonClick = function() {
                if($scope.options.sortDirection === $scope.DESCENDING) {
                    $scope.refreshData();
                }
            };

            $scope.handleDescButtonClick = function() {
                if($scope.options.sortDirection === $scope.ASCENDING) {
                    $scope.refreshData();
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });

            // Begin Daniel's stuff here ===========================================================
            var csvSuccess = function(queryResults) {
                window.location.assign(queryResults.data);
                //window.alert(queryResults.data);
            }

            var csvFail = function(response) {
                window.alert("Failure.");
            }
            $scope.requestExport = function() {
                /*Not entirely sure if I need this or not. Leaving it here but commented for now.
                XDATA.userALE.log({
                    activity: "",
                    action: "",
                    elementId: "",
                    elementType: "",
                    elementGroup: "",
                    source: "",
                    tags: ["", "", ""]
                });*/
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    window.alert("No active connection.");
                    return;
                }
                var query = $scope.buildQuery();
                // With any luck, \/ that line sends out a request to the ExportService, which then does some stuff and sends back "Hello there" or something.
                connection.executeExport(query, csvSuccess, csvFail, 'queryResultsTable');
            }
            // End Daniel's stuff here =============================================================
        }
    };
}]);
