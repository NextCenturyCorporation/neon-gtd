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

angular.module('neonDemo.directives').directive('singleTableVisualization',
['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'ThemeService', 'VisualizationService',
function(connectionService, datasetService, errorNotificationService, filterService, exportService, themeService, visualizationService) {
    return {
        templateUrl: 'components/singleTableVisualization/singleTableVisualization.html',
        restrict: 'EA',
        scope: {
            bindings: '=',
            logElementGroup: '@?',
            logElementType: '@?',
            name: '@',
            stateId: '@',
            type: '@',
            visualizationId: '@'
        },

        compile: function($element, $attrs) {
            $element.find(".visualization").attr("ng-controller", $attrs.type + "Controller");
            $element.find(".visualization").attr("visualization-id", $attrs.visualizationId);
            $element.find(".visualization-display").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Display.html'");
            $element.find(".visualization-headers").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Headers.html'");
            $element.find(".visualization-options").attr("ng-include", "'components/" + $attrs.type + "/" + $attrs.type + "Options.html'");

            // Returns the angular directive link function.
            return function($scope, $element) {
                $scope.element = $element;
                $scope.logElementGroup = $scope.logElementGroup || "chart_group";
                $scope.logElementType = $scope.logElementType || "canvas";
            }
        },

        controller: ["$scope", "$element", function($scope, $element) {
            $scope.functions = {};

            $scope.active = {
                database: {},
                table: {},
                unsharedFilterField: {}
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.init = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, executeQuery);
                $scope.messenger.events({
                    filtersChanged: handleFiltersChangedEvent
                });

                $scope.exportId = exportService.register($scope.makeExportObject);
                themeService.registerListener($scope.visualizationId, handleThemeChangedEvent);
                visualizationService.register($scope.stateId, getBindingFields);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["remove", $scope.type]
                    });

                    $scope.element.off("resize", resize);
                    $scope.element.find(".filter-container").off("resize", resizeDisplay);
                    $scope.messenger.unsubscribeAll();

                    if($scope.filter) {
                        removeFilter(true);
                    }

                    exportService.unregister($scope.exportId);
                    themeService.unregisterListener($scope.visualizationId);
                    visualizationService.unregister($scope.stateId);

                    $scope.functions.onDestroy();
                });

                $scope.element.resize(resize);
                $scope.element.find(".filter-container").resize(resizeDisplay);
                resize();

                $scope.functions.onInit();

                updateDatabases();
            };

            /**
             * Resizes the title and the display of this visualization.
             * @method resize
             * @private
             */
            var resize = function() {
                resizeTitle();
                resizeDisplay();
            };

            /**
             * Resizes the title of this visualization.
             * @method resizeTitle
             * @private
             */
            var resizeTitle = function() {
                // Set the width of the title to the width of this visualization minus the width of the options button/text, padding, and any other elements in the title header.
                var titleWidth = $scope.element.width() - $scope.element.find(".chart-options").outerWidth(true) - 20;
                $scope.element.find(".title").css("maxWidth", titleWidth);
            };

            /**
             * Resizes the display of this visualization.
             * @method resizeDisplay
             * @private
             */
            var resizeDisplay = function() {
                var headerHeight = 0;
                $scope.element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $("#" + $scope.visualizationId).height($scope.element.height() - headerHeight);
                $scope.functions.onResize();
            };

            /**
             * Handles the behavior for destroying this visualization.
             * @method onDestroy
             */
            $scope.functions.onDestroy = function() {
                // Do nothing.
            };

            /**
             * Handles the behavior for initializing this visualization.
             * @method onInit
             */
            $scope.functions.onInit = function() {
                // Do nothing.
            };

            /**
             * Handles the behavior for resizing this visualization.
             * @method onResize
             */
            $scope.functions.onResize = function() {
                // Do nothing.
            };

            /**
             * Gets the list of databases from the dataset service, sets the active database, table, and fields, and queries for new data.
             * @method updateDatabases
             * @private
             */
            var updateDatabases = function() {
                $scope.databases = datasetService.getDatabases();
                $scope.active.database = $scope.databases[0];
                if($scope.bindings.database) {
                    $scope.databases.forEach(function(database) {
                        if($scope.bindings.database === database.name) {
                            $scope.active.database = database;
                        }
                    });
                }

                updateTables();
            };

            /**
             * Gets the list of tables from the dataset service, sets the active table and fields, and queries for new data.
             * @method updateTables
             * @private
             */
            var updateTables = function() {
                $scope.tables = datasetService.getTables($scope.active.database.name);
                $scope.active.table = $scope.tables[0];
                if($scope.bindings.table) {
                    $scope.tables.forEach(function(table) {
                        if($scope.bindings.table === table.name) {
                            $scope.active.table = table;
                        }
                    });
                }

                updateFields();
            };

            /**
             * Gets the list of fields from the dataset service, sets the active fields, and queries for new data.
             * @method updateFields
             * @private
             */
            var updateFields = function() {
                // Stop extra data queries that may be caused by event handlers triggered by setting the active fields.
                $scope.initializing = true;

                if($scope.filter) {
                    removeFilter(true);
                }

                $scope.fields = datasetService.getSortedFields($scope.active.database.name, $scope.active.table.name);

                var filterFieldName = $scope.bindings.unsharedFilterField || "";
                $scope.active.unsharedFilterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterFieldName;
                }) || datasetService.createBlankField();
                $scope.active.unsharedFilterValue = $scope.bindings.unsharedFilterValue || "";

                $scope.functions.onUpdateFields(datasetService);
                $scope.functions.onChangeField();

                if($scope.active.database && $scope.active.database.name && $scope.active.table && $scope.active.table.name) {
                    updateFilter();
                }

                executeQuery();

                $scope.initializing = false;
            };

            /**
             * Handles the behavior for updating the fields for this visualization.
             * @param {Object} datasetService
             * @method onUpdateFields
             */
            $scope.functions.onUpdateFields = function() {
                // Do nothing.
            };

            /**
             * Handles the behavior for changing a data field in this visualization.
             * @method onChangeField
             */
            $scope.functions.onChangeField = function() {
                // Do nothing.
            };

            /**
             * Executes the query and updates the data for this visualization.
             * @method executeQuery
             * @private
             */
            var executeQuery = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                // Save the title during the query so the title doesn't change immediately if the user changes the unshared filter.
                $scope.queryTitle = $scope.createTitle(true);

                // Resize the title and display after the error is hidden and the title is changed.
                resize();

                // Clear the display.
                $scope.functions.updateData([]);

                var connection = connectionService.getActiveConnection();

                if(!connection || !$scope.functions.hasValidDataFields(datasetService)) {
                    return;
                }

                var query = createQuery();

                XDATA.userALE.log({
                    activity: "alter",
                    action: "send",
                    elementId: $scope.type,
                    elementType: $scope.logElementType,
                    elementSub: $scope.type,
                    elementGroup: $scope.logElementGroup,
                    source: "system",
                    tags: ["query", $scope.type]
                });

                if($scope.outstandingDataQuery) {
                    $scope.outstandingDataQuery.abort();
                }

                $scope.outstandingDataQuery = connection.executeQuery(query);
                $scope.outstandingDataQuery.done(function() {
                    $scope.outstandingDataQuery = undefined;
                });

                $scope.outstandingDataQuery.done(function(response) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["receive", $scope.type]
                    });

                    $scope.functions.updateData(response.data);

                    XDATA.userALE.log({
                        activity: "alter",
                        action: "render",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["render", $scope.type]
                    });
                });

                $scope.outstandingDataQuery.fail(function(response) {
                    if(response.status === 0) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "canceled",
                            elementId: $scope.type,
                            elementType: $scope.logElementType,
                            elementSub: $scope.type,
                            elementGroup: $scope.logElementGroup,
                            source: "system",
                            tags: ["canceled", $scope.type]
                        });
                    } else {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "failed",
                            elementId: $scope.type,
                            elementType: $scope.logElementType,
                            elementSub: $scope.type,
                            elementGroup: $scope.logElementGroup,
                            source: "system",
                            tags: ["failed", $scope.type]
                        });

                        $scope.functions.updateData([]);

                        // See if the error response contains a Neon notification to show through the Error Notification Service.
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($scope.element, response.responseJSON.error, response.responseJSON.stackTrace);
                            // TODO Create an ERROR_CODES object in the Error Notification Service
                            $scope.functions.onError(response, {
                                TOO_MUCH_DATA_ERROR: errorNotificationService.TOO_MUCH_DATA_ERROR
                            });
                        }
                    }
                });
            };

            /**
             * Returns whether this visualization has valid data fields in order to execute a query.
             * @param {Object} datasetService
             * @method hasValidDataFields
             * @return {Boolean}
             */
            $scope.functions.hasValidDataFields = function() {
                return true;
            };

            /**
             * Updates the data and display for this visualization.  Clears the display if the data array is empty.
             * @param {Array} data
             * @method updateData
             */
            $scope.functions.updateData = function(data) {
                // Do nothing.
            };

            /**
             * Creates a query object for this visualization.
             * @return neon.query.Query
             * @method createQuery
             */
            var createQuery = function() {
                var query = new neon.query.Query().selectFrom($scope.active.database.name, $scope.active.table.name);
                var whereClause = $scope.functions.createQueryClause();
                if(datasetService.isFieldValid($scope.active.unsharedFilterField) && $scope.active.unsharedFilterValue) {
                    var operator = "contains";
                    var value = $scope.active.unsharedFilterValue;
                    if($.isNumeric(value)) {
                        operator = "=";
                        value = parseFloat(value);
                    }
                    var unsharedFilterWhereClause = neon.query.where($scope.active.unsharedFilterField.columnName, operator, value);
                    whereClause = whereClause ? neon.query.and(whereClause, unsharedFilterWhereClause) : unsharedFilterWhereClause;
                }
                query.where(whereClause);
                return $scope.functions.addToQuery(query, filterService);
            }

            /**
             * Creates and returns the where clause for the query for this visualization (or undefined).
             * @method createQueryClause
             * @return {neon.query.Where}
             */
            $scope.functions.createQueryClause = function() {
                return undefined;
            };

            /**
             * Adds to the given Neon query and returns the updated query for this visualization.
             * @param {neon.query.Query} query
             * @param {Object} filterService
             * @method addToQuery
             * @return {neon.query.Query}
             */
            $scope.functions.addToQuery = function(query) {
                return query;
            };

            /**
             * Handles the behavior for additional responses to query errors.
             * @param {Object} response The query response
             * @param {Object} errorCodes An object containing the error codes important to the Neon Dashboard
             * @method onError
             */
            $scope.functions.onError = function() {
                // Do nothing.
            };

            /**
             * Generates and returns the title for this visualization.
             * @param {Boolean} resetQueryTitle
             * @method createTitle
             * @return {String}
             */
            $scope.createTitle = function(resetQueryTitle) {
                if(resetQueryTitle) {
                    $scope.queryTitle = "";
                }
                if($scope.queryTitle) {
                    return $scope.queryTitle;
                }
                var title = $scope.active.unsharedFilterValue ? $scope.active.unsharedFilterValue + " " : "";
                if($scope.bindings.title) {
                    return title + $scope.bindings.title;
                }
                if(_.keys($scope.active).length) {
                    return title + $scope.active.table.prettyName;
                }
                return title;
            };

            /**
             * Event handler for theme changed events issued over Neon's messaging channels.
             * @param {Object} theme The new Neon Dashboard theme
             * @method handleThemeChangedEvent
             * @private
             */
            var handleThemeChangedEvent = function(theme) {
                if($scope.functions.onThemeChanged(theme)) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "receive",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["theme-changed", $scope.type]
                    });
                }
            };

            /**
             * Handles the behavior for changing the theme of elements in this visualization to the given theme.
             * @param {Object} theme
             * @method onThemeChanged
             * @return {Boolean} Whether them theme of any elements in this visualization needed to be changed
             */
            $scope.functions.onThemeChanged = function() {
                return false;
            };

            /**
             * Event handler for filters changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filters changed message
             * @method handleFiltersChangedEvent
             * @private
             */
            var handleFiltersChangedEvent = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.active.database.name && message.addedFilter.tableName === $scope.active.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "system",
                        tags: ["filters-changed", $scope.type]
                    });

                    updateFilter();
                    executeQuery();
                }
            };

            /*
             * Updates the filter with any matching filters found.
             * @method updateFilter
             * @private
             */
            var updateFilter = function() {
                var filterFields = $scope.functions.getFilterableFields();
                var valid = true;
                filterFields.forEach(function(field) {
                    valid = valid && datasetService.isFieldValid(field);
                });

                if(valid) {
                    var filterFieldNames = filterFields.map(function(field) {
                        return field.columnName;
                    });
                    var filter = filterService.getFilter($scope.active.database.name, $scope.active.table.name, filterFieldNames);
                    $scope.filter = $scope.functions.createFilterFromClause(filter);
                    if(!$scope.filter) {
                        $scope.functions.onRemoveFilter();
                    }
                }
            };

            /**
             * Returns the list of field objects on which filters for this visualization are set.
             * @method getFilterableFields
             * @return {Array}
             */
            $scope.functions.getFilterableFields = function() {
                return [];
            };

            /**
             * Creates and returns a filter data object for this visualization using the where clause in the given neon.query.Filter object.
             * The default implementation requires a Neon filter with a single clause and returns an object containing:
             *      {String} database The filter database
             *      {String} table The filter table
             *      {String} field The filter field
             *      {String} value The filter value
             * @param {neon.query.Filter} filter
             * @method createFilterFromClause
             * @return {Object}
             */
            $scope.functions.createFilterFromClause = function(filter) {
                if(filter && filterService.hasSingleClause(filter)) {
                    return {
                        field: filter.filter.whereClause.lhs,
                        value: filter.filter.whereClause.rhs,
                        database: filter.filter.databaseName,
                        table: filter.filter.tableName
                    };
                }
                return undefined;
            };

            /**
             * Handles the behavior for removing the filter from this visualization.
             * @method onRemoveFilter
             */
            $scope.functions.onRemoveFilter = function() {
                // Do nothing.
            };

            /**
             * Adds the given filter as a new filter to the dashboard.  If the new filter matches the old filter, removes the old filter instead.
             * @param {Object} newFilter Contains the data for the new filter.  The default implementation assumes:
             *      {String} field The filter field
             *      {String} value The filter value
             * @method addFilter
             */
            $scope.functions.addFilter = function(newFilter) {
                newFilter.database = $scope.active.database.name;
                newFilter.table = $scope.active.table.name;

                if($scope.filter && $scope.functions.doesFilterMatch(newFilter)) {
                    removeFilter(true);
                    return;
                }

                $scope.filter = newFilter;

                var connection = connectionService.getActiveConnection();

                if($scope.messenger && connection) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: "click",
                        elementId: $scope.type,
                        elementType: $scope.logElementType,
                        elementSub: $scope.type,
                        elementGroup: $scope.logElementGroup,
                        source: "user",
                        tags: ["filter", $scope.type]
                    });

                    filterService.addFilter($scope.messenger, $scope.filter.database, $scope.filter.table, $scope.functions.getFilterFields($scope.filter), $scope.functions.createNeonFilterClause, {
                        visName: $scope.name,
                        text: $scope.functions.createFilterText(newFilter)
                    });
                }
            };

            /**
             * Returns whether the the given filter data object matches the global filter data object.  The default
             * implementation compares the "database", "table", "field", and "value" properties of the objects.
             * @param {Object} otherFilter
             * @method doesFilterMatch
             * @return {Boolean}
             */
            $scope.functions.doesFilterMatch = function(otherFilter) {
                return $scope.filter.database === otherFilter.database && $scope.filter.table === otherFilter.table &&
                    $scope.filter.field === otherFilter.field && $scope.filter.value === otherFilter.value;
            };

            /**
             * Returns the list of fields in the global filter data object.  The default implementation returns a list containing the "field" property of the object.
             * @method getFilterFields
             * @return {Array}
             */
            $scope.functions.getFilterFields = function(filter) {
                return [filter.field];
            };

            /**
             * Creates and returns the where clause for a Neon filter on the given database, table, and field(s) using the value(s) set in this visualization.
             * @param {Object} databaseAndTableName Contains {String} database and {String} table
             * @param {String} fieldName or {Array} fieldNames The name (or list of names) of the filter field(s)
             * @method createNeonFilterClause
             * @return {neon.query.Where}
             */
            $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
                return neon.query.where(fieldName, "!=", undefined);
            };

            /**
             * Returns the description text for the global filter data object.  The default implementation uses the "field" and "value" properties of the object.
             * @method createFilterText
             * @return {String}
             */
            $scope.functions.createFilterText = function(filter) {
                return filter.field + " = " + filter.value;
            };

            /**
             * Utility function for removing the filter(s) set in this visualization from the dashboard.
             * @method removeFilter
             */
            $scope.functions.removeFilter = function() {
                removeFilter();
            };

            /**
             * Removes the current filter from the dashboard and this visualization.
             * @param {Boolean} fromSystem
             * @method removeFilter
             * @private
             */
            var removeFilter = function(fromSystem) {
                if($scope.filter) {
                    if(!fromSystem) {
                        XDATA.userALE.log({
                            activity: "deselect",
                            action: "click",
                            elementId: $scope.type,
                            elementType: "button",
                            elementSub: $scope.type,
                            elementGroup: $scope.logElementGroup,
                            source: "user",
                            tags: ["filter", $scope.type]
                        });
                    }

                    filterService.removeFilter($scope.filter.database, $scope.filter.table, $scope.functions.getFilterFields($scope.filter), function() {
                        $scope.filter = undefined;
                        $scope.functions.onRemoveFilter();
                    });
                }
            };

            /**
             * Creates and returns an object that contains all the binding fields needed to recreate this visualization's state.
             * @return {Object}
             * @method getBindingFields
             * @private
             */
            var getBindingFields = function() {
                var bindingFields = {};

                // TODO Update to use the new binding system.
                bindingFields["bind-database"] = ($scope.active.database && $scope.active.database.name) ? "'" + $scope.active.database.name + "'" : undefined;
                bindingFields["bind-filter-field"] = datasetService.isFieldValid($scope.active.unsharedFilterField) ? "'" + $scope.active.unsharedFilterField.columnName + "'" : undefined;
                var hasFilterValue = datasetService.isFieldValid($scope.active.unsharedFilterField) && $scope.active.unsharedFilterValue;
                bindingFields["bind-filter-value"] = hasFilterValue ? "'" + $scope.active.unsharedFilterValue + "'" : undefined;
                bindingFields["bind-table"] = ($scope.active.table && $scope.active.table.name) ? "'" + $scope.active.table.name + "'" : undefined;
                bindingFields["bind-title"] = "'" + $scope.createTitle() + "'";

                return $scope.functions.addToBindings(bindingFields);
            };

            /**
             * Adds to the given list of bindings and returns the updated list for this visualization.
             * @param {Array} bindings
             * @method addToBindings
             * @return {Array}
             */
            $scope.functions.addToBindings = function(bindings) {
                return bindings;
            };

            /**
             * Logs the change for the given option, value, and element type.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method logChange
             * @private
             */
            var logChange = function(option, value, type) {
                XDATA.userALE.log({
                    activity: "select",
                    action: "click",
                    elementId: $scope.type,
                    elementType: type || "combobox",
                    elementSub: option,
                    elementGroup: $scope.logElementGroup,
                    source: "user",
                    tags: ["options", $scope.type, value]
                });
            };

            /**
             * Handles changing the database.
             * @method handleChangeDatabase
             */
            $scope.handleChangeDatabase = function() {
                logChange("database", $scope.active.database.name);
                updateTables();
            };

            /**
             * Handles changing the table.
             * @method handleChangeTable
             */
            $scope.handleChangeTable = function() {
                logChange("table", $scope.active.table.name);
                updateFields();
            };

            /**
             * Handles changing the unshared filter field.
             * @method handleChangeUnsharedFilterField
             */
            $scope.handleChangeUnsharedFilterField = function() {
                logChange("unshared-filter-field", $scope.active.unsharedFilterField.columnName);
                $scope.active.unsharedFilterValue = "";
            };

            /**
             * Handles changing the unshared filter value.
             * @method handleChangeUnsharedFilterValue
             */
            $scope.handleChangeUnsharedFilterValue = function() {
                logChange("unshared-filter-value", $scope.active.unsharedFilterValue);
                if(!$scope.initializing) {
                    executeQuery();
                }
            };

            /**
             * Handles removing the unshared filter.
             * @method handleRemoveUnsharedFilter
             */
            $scope.handleRemoveUnsharedFilter = function() {
                logChange("unshared-filter", "", "button");
                $scope.active.unsharedFilterValue = "";
                if(!$scope.initializing) {
                    executeQuery();
                }
            };

            /**
             * Utility function for logging a change of the given option to the given value using an element of the given type and executing a new query.
             * @param {String} option
             * @param {String} value
             * @param {String} type (Optional) [Default:  combobox]
             * @method handleChangeField
             */
            $scope.functions.handleChangeField = function(option, value, type) {
                logChange(option, value, type);
                if(!$scope.initializing) {
                    $scope.functions.onChangeField();
                    executeQuery();
                }
            };

            /**
             * Called by the options-menu directive.  Wrapper for createMenuText.
             * @method optionsMenuButtonText
             * @return {String}
             */
            $scope.optionsMenuButtonText = function() {
                return $scope.functions.createMenuText();
            };

            /**
             * Creates and returns the text for the options menu button.
             * @method createMenuText
             * @return {String}
             */
            $scope.functions.createMenuText = function() {
                return "";
            };

            /**
             * Called by the options-menu directive.  Wrapper for showMenuText.
             * @method showOptionsMenuButtonText
             * @return {Boolean}
             */
            $scope.showOptionsMenuButtonText = function() {
                return $scope.functions.showMenuText();
            };

            /**
             * Returns whether to show the text for the options menu button.
             * @method showMenuText
             * @return {Boolean}
             */
            $scope.functions.showMenuText = function() {
                return false;
            };

            /**
             * Called by the options-menu directive.  Wrapper for createExportObject.
             * @method makeExportObject
             * @return {Object}
             */
            $scope.makeExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: $scope.type,
                    elementType: "button",
                    elementSub: "export",
                    elementGroup: $scope.logElementGroup,
                    source: "user",
                    tags: ["options", $scope.type, "export"]
                });

                var query = createQuery();
                query.limitClause = exportService.getLimitClause();
                return $scope.functions.createExportDataObject(query);
            };

            /**
             * Creates and returns an object containing the data needed to export this visualization.
             * @param {neon.query.Query} query
             * @method createExportDataObject
             * @return {Object}
             */
            $scope.functions.createExportDataObject = function() {
                return {};
            };

            /**
             * Initializes this visualization.
             * @method init
             */
            $scope.functions.init = function() {
                neon.ready(function() {
                    $scope.init();
                });
            };
        }]
    };
}]);
