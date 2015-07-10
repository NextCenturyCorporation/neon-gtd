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
.directive('countBy', ['external', 'popups', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService',
function(external, popups, connectionService, datasetService, errorNotificationService, filterService, exportService) {
    return {
        templateUrl: 'partials/directives/countby.html',
        restrict: 'EA',
        scope: {
            bindCountField: '=',
            bindAggregation: '=',
            bindAggregationField: '=',
            bindTable: '=',
            bindDatabase: '=',
            usePrettyNames: '=?',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass('countByDirective');

            $scope.element = $element;

            // Unique field name used for the SlickGrid column containing the URLs for the external apps.
            // This name should be one that is highly unlikely to be a column name in a real database.
            $scope.EXTERNAL_APP_FIELD_NAME = "neonExternalApps";

            $scope.databases = [];
            $scope.tables = [];
            $scope.count = 0;
            $scope.fields = [];
            $scope.tableId = 'countby-' + uuid();
            $scope.filterKeys = {};
            $scope.filterSet = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;

            $scope.options = {
                database: {},
                table: {},
                field: "",
                aggregation: "",
                aggregationField: ""
            };

            var $tableDiv = $element.find('.count-by-grid');
            $tableDiv.attr("id", $scope.tableId);

            /**
             * Updates the size of the table to fill the available space in the directive's area.
             * @method updateSize
             * @private
             */
            var updateSize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                // Subtract an additional 2 pixels from the table height to account for the its border.
                $('#' + $scope.tableId).height($element.height() - headerHeight - 2);
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
                    filtersChanged: onFiltersChanged
                });

                $scope.exportID = exportService.register($scope.makeCountByExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "click",
                        elementId: "count-by",
                        elementType: "datagrid",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["remove", "count-by"]
                    });
                    popups.links.deleteData($scope.tableId);
                    $element.off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    if($scope.filterSet) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                });

                $element.resize(updateSize);
            };

            var logOptionsMenuDropdownChange = function(element, value) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: "count-by",
                    elementType: "combobox",
                    elementSub: element,
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "count-by", value]
                });
            };

            $scope.handleChangeField = function() {
                logOptionsMenuDropdownChange("count-field", $scope.options.field);
                if(!$scope.loadingData) {
                    $scope.queryForData();
                }
            };

            $scope.handleChangeAggregation = function() {
                logOptionsMenuDropdownChange("aggregation", $scope.options.aggregation);
                if(!$scope.loadingData) {
                    $scope.queryForData();
                }
            };

            $scope.handleChangeAggregationField = function() {
                logOptionsMenuDropdownChange("aggregation-field", $scope.options.aggregationField);
                if(!$scope.loadingData) {
                    $scope.queryForData();
                }
            };

            function createOptions(data) {
                var options = {
                    data: data.data,
                    columns: createColumns(data.data),
                    gridOptions: {
                        enableTextSelectionOnCells: true,
                        forceFitColumns: true,
                        enableColumnReorder: true,
                        forceSyncScrolling: true
                    }
                };

                return options;
            }

            var createAggregationColumnName = function() {
                if($scope.options.aggregation === "count") {
                    return $scope.usePrettyNames ? "Count" : "count";
                }

                var aggregationFieldName = $scope.usePrettyNames ? datasetService.getPrettyField($scope.options.table.name, $scope.options.aggregationField) : $scope.options.aggregationField;

                if($scope.options.aggregation === "min") {
                    return ($scope.usePrettyNames ? "Min " : "min ") + aggregationFieldName;
                }

                if($scope.options.aggregation === "max") {
                    return ($scope.usePrettyNames ? "Max " : "max ") + aggregationFieldName;
                }

                return "";
            };

            var createColumns = function(data) {
                var fieldName = $scope.usePrettyNames ? datasetService.getPrettyField($scope.options.table.name, $scope.options.field) : $scope.options.field;

                // Since forceFitColumns is enabled, setting this width will force the columns to use as much
                // space as possible, which is necessary to keep the first column as small as possible.
                var tableWidth = $tableDiv.outerWidth();

                var columns = [{
                    name: fieldName,
                    field: $scope.options.field,
                    width: tableWidth
                }, {
                    name: createAggregationColumnName(),
                    field: $scope.options.aggregation === "count" ? "count" : $scope.options.aggregationField,
                    width: tableWidth
                }];

                if(external.anyEnabled && data.length) {
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
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "count-by",
                    elementType: "canvas",
                    elementSub: "count-by",
                    elementGroup: "table_group",
                    source: "system",
                    tags: ["filter-change", "count-by"]
                });
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    $scope.queryForData();
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
                            break;
                        }
                    }
                }
                $scope.filterKeys = filterService.createFilterKeys("countby", datasetService.getDatabaseAndTableNames());

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
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, ["count_by"]) || $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }
                $scope.updateFields();
            };

            $scope.updateFields = function() {
                $scope.loadingData = true;
                $scope.fields = datasetService.getDatabaseFields($scope.options.database.name, $scope.options.table.name);
                $scope.fields.sort();
                $scope.options.field = $scope.bindCountField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "count_by") || "";
                $scope.options.aggregation = $scope.bindAggregation || "count";
                $scope.options.aggregationField = $scope.bindAggregationField || "";
                if($scope.filterSet) {
                    $scope.clearFilter();
                }
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

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.options.field || ($scope.options.aggregation !== "count" && !$scope.options.aggregationField)) {
                    $scope.updateData({
                        data: []
                    });
                    $scope.loadingData = false;
                    return;
                }

                var query = $scope.buildQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "send",
                    elementId: "count-by",
                    elementType: "canvas",
                    elementSub: "count-by",
                    elementGroup: "table_group",
                    source: "system",
                    tags: ["query", "count-by"]
                });

                connection.executeQuery(query, function(queryResults) {
                    $scope.$apply(function() {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "receive",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["receive", "count-by"]
                        });
                        $scope.updateData(queryResults);
                        $scope.loadingData = false;
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "render",
                            elementId: "count-by",
                            elementType: "canvas",
                            elementSub: "count-by",
                            elementGroup: "table_group",
                            source: "system",
                            tags: ["render", "count-by"]
                        });
                    });
                }, function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "failed",
                        elementId: "count-by",
                        elementType: "canvas",
                        elementSub: "count-by",
                        elementGroup: "table_group",
                        source: "system",
                        tags: ["failed", "count-by"]
                    });
                    $scope.updateData({
                        data: []
                    });
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            $scope.stripIdField = function(dataObject) {
                var data = dataObject.data;

                var cleanData = [];
                for(var i = 0; i < data.length; i++) {
                    var row = {};
                    row[$scope.options.field] = data[i][$scope.options.field];
                    if($scope.options.aggregation === "count") {
                        row.count = data[i].count;
                    } else {
                        row[$scope.options.aggregationField] = data[i][$scope.options.aggregationField];
                    }
                    cleanData.push(row);
                }
                dataObject.data = cleanData;
                return dataObject;
            };

            $scope.addExternalAppUrlColumnData = function(data) {
                var tableLinks = [];

                data.data.forEach(function(row) {
                    var field = $scope.options.field;
                    var value = row[$scope.options.field];
                    var query = field + "=" + value;

                    var links = [];

                    if(external.dig.enabled) {
                        links.push($scope.createLinkObject(external.dig, field, value, query));
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

            $scope.createLinkObject = function(config, field, value, query) {
                var link = {
                    name: config.count_by.name,
                    image: config.count_by.image,
                    url: config.count_by.url,
                    args: [],
                    data: {
                        server: config.server,
                        field: field,
                        value: value,
                        query: query
                    }
                };

                for(var i = 0; i < config.count_by.args.length; ++i) {
                    var arg = config.count_by.args[i];
                    link.args.push({
                        name: arg.name,
                        value: arg.value
                    });
                }

                return link;
            };

            /**
             * Saves the given field and value as the current filter for the
             * dashboard and this widget.
             * @param {String} The filter field
             * @param {String} The filter value
             */
            $scope.setFilter = function(field, value) {
                var filterExists = $scope.filterSet ? true : false;
                handleSetFilter(field, value);

                // Store the value for the filter to use during filter creation.
                $scope.filterValue = value;

                var connection = connectionService.getActiveConnection();
                if($scope.messenger && connection) {
                    var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [field]);
                    if(filterExists) {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "count-by",
                            elementType: "datagrid",
                            elementSub: "row",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["filter", "count-by"]
                        });
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForCount);
                    } else {
                        XDATA.userALE.log({
                            activity: "select",
                            action: "click",
                            elementId: "count-by",
                            elementType: "datagrid",
                            elementSub: "row",
                            elementGroup: "table_group",
                            source: "user",
                            tags: ["filter", "count-by"]
                        });
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilterClauseForCount);
                    }
                }
            };

            /**
             * Creates and returns a filter using the given table and count field using the value set by this visualization.
             * @param {String} The name of the table on which to filter
             * @param {String} The name of the count field on which to filter
             * @method createFilterClauseForCount
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilterClauseForCount = function(tableName, fieldName) {
                return neon.query.where(fieldName, '=', $scope.filterValue);
            };

            /**
             * Adds an onClick listener for selecting the rows in the table that
             * sets a filter on the data in the selected row.
             */
            $scope.addOnClickListener = function() {
                $scope.table.addOnClickListener(function(columns, row) {
                    var columnIndex = external.anyEnabled ? 1 : 0;
                    var field = columns[columnIndex].field;

                    // If the user clicks on the filtered row/cell, clear the filter.
                    if($scope.filterSet !== undefined) {
                        if($scope.filterSet.key === field && $scope.filterSet.value === row[field]) {
                            $scope.clearFilter();
                            return;
                        }
                    }

                    $tableDiv.addClass("filtered");
                    $scope.$apply(function() {
                        $scope.setFilter(field, row[field]);
                    });
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
                if(!($("#" + $scope.tableId).length)) {
                    return;
                }

                var cleanData = $scope.stripIdField(queryResults);

                // If the table is recreated while sorting is set, we must redo the sorting on the new table; else, sort the table by the aggregation field.
                var sortInfo = $scope.table ? $scope.table.sortInfo_ : {
                    name: createAggregationColumnName(),
                    field: $scope.options.aggregation === "count" ? "count" : $scope.options.aggregationField,
                    sortAsc: false
                };

                $scope.tableOptions = createOptions(cleanData);

                // Add the URLs for the external applications after the table options have been created because it already includes the column.
                if(external.anyEnabled && cleanData.data.length) {
                    cleanData = $scope.addExternalAppUrlColumnData(cleanData);
                }

                $scope.count = cleanData.data.length;
                $scope.table = new tables.Table("#" + $scope.tableId, $scope.tableOptions).draw();
                $scope.addOnClickListener();
                updateSize();

                $scope.table.sortColumnAndChangeGlyph(sortInfo);

                // If the table is recreated while a filter is set, we must re-select the filtered row/cells.
                if($scope.filterSet !== undefined) {
                    $scope.table.setActiveCellIfMatchExists($scope.filterSet.key, $scope.filterSet.value);
                }

                // Set the displayed link data for the links popup for the application using the source and index stored in to the triggering button.
                $(".links-popup").on("show.bs.modal", function(event) {
                    var button = $(event.relatedTarget);
                    var source = button.data("links-source");
                    var index = button.data("links-index");
                    $scope.$apply(function() {
                        popups.links.setView(source, index);
                    });
                });
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            $scope.buildQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).groupBy($scope.options.field);

                // The widget displays its own ignored rows with 0.5 opacity.
                query.ignoreFilters([$scope.filterKeys[$scope.options.database.name][$scope.options.table.name]]);

                if($scope.options.aggregation === "count") {
                    query.aggregate(neon.query.COUNT, '*', 'count');
                }
                if($scope.options.aggregation === "min") {
                    query.aggregate(neon.query.MIN, $scope.options.aggregationField, $scope.options.aggregationField);
                }
                if($scope.options.aggregation === "max") {
                    query.aggregate(neon.query.MAX, $scope.options.aggregationField, $scope.options.aggregationField);
                }

                return query;
            };

            /**
             * Removes the current filter from the dashboard and this widget.
             */
            $scope.clearFilter = function() {
                if($scope.messenger) {
                    XDATA.userALE.log({
                        activity: "deselect",
                        action: "click",
                        elementId: "count-by",
                        elementType: "button",
                        elementGroup: "table_group",
                        source: "user",
                        tags: ["filter", "count-by"]
                    });
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        $tableDiv.removeClass("filtered");
                        $scope.table.deselect();
                        clearFilter();
                    });
                }
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeCountByExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "count-by-export",
                    elementType: "button",
                    elementGroup: "table_group",
                    source: "user",
                    tags: ["options", "count-by", "export"]
                });
                var query = $scope.buildQuery();
                query.limitClause = exportService.getLimitClause();
                var finalObject = {
                    name: "Count_By",
                    data: [{
                        query: query,
                        name: "countBy-" + $scope.exportID,
                        fields: [],
                        ignoreFilters: query.ignoreFilters_,
                        selectionOnly: query.selectionOnly_,
                        ignoredFilterIds: query.ignoredFilterIds_,
                        type: "query"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: (query.groupByClauses[0]).field,
                    pretty: capitalizeFirstLetter((query.groupByClauses[0]).field)
                });
                var op = '';
                if($scope.options.aggregation === 'min') {
                    op = 'Min of ';
                } else if($scope.options.aggregation === 'max') {
                    op = 'Max of ';
                }
                finalObject.data[0].fields.push({
                    query: (query.aggregates[0]).name,
                    pretty: op + capitalizeFirstLetter((query.aggregates[0]).name)
                });
                return finalObject;
            };

            /**
             * Helper function for makeBarchartExportObject that capitalizes the first letter of a string.
             * @param str {String} The string to capitalize the first letter of.
             * @return {String} The string given, but with its first letter capitalized.
             */
            var capitalizeFirstLetter = function(str) {
                var first = str[0].toUpperCase();
                return first + str.slice(1);
            };

            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
