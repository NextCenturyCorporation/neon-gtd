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
'use strict';

/**
 * This directive is for building a tag cloud
 */
angular.module('neonDemo.directives')
.directive('tagCloud', ['external', 'ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', 'ExportService', 'LinksPopupService', 'TranslationService', '$timeout',
function(external, connectionService, datasetService, errorNotificationService, filterService, exportService, linksPopupService, translationService, $timeout) {
    return {
        templateUrl: 'partials/directives/tagCloud.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindTagField: '=',
            bindFilterField: '=',
            bindFilterValue: '=',
            bindTable: '=',
            bindDatabase: '=',
            hideHeader: '=?',
            hideAdvancedOptions: '=?'
        },
        link: function($scope, $element) {
            $element.addClass("tagcloud-container");

            $scope.element = $element;
            $scope.visualizationId = "text-cloud-" + uuid();

            $scope.showOptionsMenuButtonText = function() {
                return $scope.filterTags.length === 0 && $scope.data.length === 0;
            };

            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.data = [];
            $scope.filterTags = [];
            $scope.showFilter = false;
            $scope.filterKeys = {};
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.linksPopupButtonIsDisabled = true;
            $scope.translationAvailable = false;
            $scope.translationLanguages = {
                fromLanguageOptions: {},
                toLanguageOptions: {},
                chosenFromLanguage: "",
                chosenToLanguage: ""
            };

            $scope.options = {
                database: {},
                table: {},
                tagField: {},
                filterField: {},
                filterValue: "",
                andTags: true,
                tagLimit: 40,
                showTranslation: false
            };

            var updateSize = function() {
                var titleWidth = $element.width() - $element.find(".chart-options").outerWidth(true);
                $element.find(".title").css("maxWidth", titleWidth - 20);
            };

            /**
             * Initializes the name of the directive's scope variables
             * and the Neon Messenger used to monitor data change events.
             * @method initialize
             * @private
             */
            var initialize = function() {
                // Toggle the points and clusters view when the user toggles between them.
                $scope.$watch('options.andTags', function(newVal, oldVal) {
                    XDATA.userALE.log({
                        activity: "select",
                        action: ($scope.loadingData) ? "reset" : "click",
                        elementId: "tag-cloud-options",
                        elementType: "button",
                        elementSub: (newVal) ? "all-filters" : "any-filters",
                        elementGroup: "chart_group",
                        source: ($scope.loadingData) ? "system" : "user",
                        tags: ["options", "tag-cloud"]
                    });
                    if(newVal !== oldVal) {
                        setTagFilter();
                    }
                });

                if(translationService.hasKey()) {
                    $scope.translationAvailable = true;
                    translationService.getSupportedLanguages(getSupportedLanguagesSuccessCallback, translationFailureCallback);
                }

                // Setup our messenger.
                $scope.messenger = new neon.eventing.Messenger();

                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForTags();
                });

                $scope.messenger.subscribe(filterService.REQUEST_REMOVE_FILTER, function(ids) {
                    if(filterService.containsKey($scope.filterKeys, ids)) {
                        clearTagFilters();
                    }
                });

                $scope.exportID = exportService.register($scope.makeTagCloudExportObject);

                $scope.$on('$destroy', function() {
                    XDATA.userALE.log({
                        activity: "remove",
                        action: "remove",
                        elementId: "tag-cloud",
                        elementType: "canvas",
                        elementSub: "tag-cloud",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["remove", "tag-cloud"]
                    });
                    linksPopupService.deleteLinks($scope.visualizationId);
                    $element.off("resize", updateSize);
                    $element.find(".chart-options").off("resize", updateSize);
                    $scope.messenger.removeEvents();
                    // Remove our filter if we had an active one.
                    if(0 < $scope.filterTags.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                    exportService.unregister($scope.exportID);
                });

                $element.resize(updateSize);
                $element.find(".chart-options").resize(updateSize);

                // setup tag cloud color/size changes
                $.fn.tagcloud.defaults = {
                    size: {
                        start: 130,
                        end: 250,
                        unit: '%'
                    },
                    color: {
                        start: '#aaaaaa',
                        end: '#2f9f3e'
                    }
                };

                $scope.$watchCollection('filterTags', function(newValue, oldValue) {
                    if(newValue.length !== oldValue.length || newValue.length > 1) {
                        setTagFilter();
                    }
                });
            };

            /**
             * Sets the 'to' and 'from' language options for translating.
             * @param {Object} languages A mapping of language codes to their names.
             * @method getSupportedLanguagesSuccessCallback
             * @private
             */
            var getSupportedLanguagesSuccessCallback = function(languages) {
                $scope.translationLanguages.fromLanguageOptions = languages;
                $scope.translationLanguages.toLanguageOptions = languages;
            };

            /**
             * Shows an error message when an error occurs in the translation service.
             * @param {Object} response An error response containing the message and reason.
             * @param {String} response.message
             * @param {String} response.reason
             * @method translationFailureCallback
             * @private
             */
            var translationFailureCallback = function(response) {
                $scope.loadingData = false;

                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }
                $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.message,  response.reason);
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    XDATA.userALE.log({
                        activity: "alter",
                        action: "query",
                        elementId: "tag-cloud",
                        elementType: "tag",
                        elementSub: "tag-cloud",
                        elementGroup: "chart_group",
                        source: "system",
                        tags: ["filter-change", "tag-cloud"]
                    });
                    queryForTags();
                }
            };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function() {
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
                $scope.filterKeys = filterService.createFilterKeys("tagcloud", datasetService.getDatabaseAndTableNames());
                $scope.updateTables();
            };

            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = datasetService.getFirstTableWithMappings($scope.options.database.name, [neonMappings.TAGS]) || $scope.tables[0];
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
                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);

                var tagField = $scope.bindTagField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, neonMappings.TAGS) || "";
                $scope.options.tagField = _.find($scope.fields, function(field) {
                    return field.columnName === tagField;
                }) || datasetService.createBlankField();
                var filterField = $scope.bindFilterField || "";
                $scope.options.filterField = _.find($scope.fields, function(field) {
                    return field.columnName === filterField;
                }) || datasetService.createBlankField();
                $scope.options.filterValue = $scope.bindFilterValue || "";

                if($scope.showFilter) {
                    clearTagFilters();
                } else {
                    queryForTags();
                }
            };

            /**
             * Triggers a query that will aggregate the most popular tags in the tag cloud
             * @method queryForTags
             * @private
             */
            var queryForTags = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.tagField)) {
                    updateTagData([]);
                    $scope.loadingData = false;
                    return;
                }

                XDATA.userALE.log({
                    activity: "alter",
                    action: "query",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementSub: "tag-cloud",
                    elementGroup: "chart_group",
                    source: "system",
                    tags: ["query", "tag-cloud"]
                });

                var whereClause = null;
                if(datasetService.isFieldValid($scope.options.filterField) && $scope.options.filterValue) {
                    var operator = $.isNumeric($scope.options.filterValue) ? "=" : "contains";
                    whereClause = neon.query.where($scope.options.filterField.columnName, operator, $scope.options.filterValue);
                }

                connection.executeArrayCountQuery($scope.options.database.name, $scope.options.table.name,
                    $scope.options.tagField.columnName, $scope.options.tagLimit, whereClause,
                    function(tagCounts) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "query",
                            elementId: "tag-cloud",
                            elementType: "tag",
                            elementSub: "tag-cloud",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["receive", "tag-cloud"]
                        });
                        $scope.$apply(function() {
                            updateTagData(tagCounts);
                            $scope.loadingData = false;
                            XDATA.userALE.log({
                                activity: "alter",
                                action: "query",
                                elementId: "tag-cloud",
                                elementType: "tag",
                                elementSub: "tag-cloud",
                                elementGroup: "chart_group",
                                source: "system",
                                tags: ["render", "tag-cloud"]
                            });
                        });
                    }, function(response) {
                        XDATA.userALE.log({
                            activity: "alter",
                            action: "query",
                            elementId: "tag-cloud",
                            elementType: "tag",
                            elementSub: "tag-cloud",
                            elementGroup: "chart_group",
                            source: "system",
                            tags: ["failed", "tag-cloud"]
                        });
                        updateTagData([]);
                        $scope.loadingData = false;
                        if(response.responseJSON) {
                            $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                        }
                    }
                );
            };

            /**
             * Updates the the tag cloud visualization.
             * @param {Array} tagCounts An array of objects with "key" and "count" properties for the tag
             * name and number of occurrences.
             * @method updateTagData
             * @private
             */
            var updateTagData = function(tagCounts) {
                if($scope.options.andTags) {
                    tagCounts = tagCounts.filter(function(elem) {
                        var index = _.findIndex($scope.filterTags, {
                            name: elem.key
                        });
                        return index === -1;
                    });
                }

                $scope.data = tagCounts.map(function(elem) {
                    elem.keyTranslated = elem.key;
                    return elem;
                });

                if($scope.options.showTranslation) {
                    translate();
                }

                // style the tags after they are displayed
                $timeout(function() {
                    $element.find('.tag').tagcloud();
                });
            };

            /**
             * Ensures that the tag filter includes the argument, and updates the tag cloud if necessary.
             * @param tagName {String} the tag that should be filtered on, e.g., "#lol"
             * @param tagNameTranslated {String} the translated version of tagName
             * @method addTagFilter
             */
            $scope.addTagFilter = function(tagName, tagNameTranslated) {
                XDATA.userALE.log({
                    activity: "add",
                    action: "click",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "tag-cloud", ($scope.options.showTranslation ? tagNameTranslated : tagName)]
                });
                var index = _.findIndex($scope.filterTags, {
                    name: tagName
                });
                if(index === -1) {
                    var filterTag = {
                        name: tagName,
                        nameTranslated: tagNameTranslated
                    };

                    var mappings = datasetService.getMappings($scope.options.database.name, $scope.options.table.name);
                    var cloudLinks = linksPopupService.createAllServiceLinkObjects(external.services, mappings, $scope.options.tagField.columnName, tagName);
                    linksPopupService.addLinks($scope.visualizationId, linksPopupService.generateKey($scope.options.tagField, tagName), cloudLinks);
                    $scope.linksPopupButtonIsDisabled = !cloudLinks.length;
                    $scope.filterTags.push(filterTag);
                }
            };

            /**
             * Changes the filter to use the ones provided in the first argument.
             * @method setTagFilter
             * @private
             */
            var setTagFilter = function() {
                if($scope.filterTags.length > 0) {
                    applyFilter();
                } else {
                    clearTagFilters();
                }
            };

            /**
             * Creates and returns a filter on the given tag field using the tags set by this visualization.
             * @param {Object} databaseAndTableName Contains the database and table name
             * @param {String} tagFieldName The name of the tag field on which to filter
             * @method createFilterClauseForTags
             * @private
             * @return {Object} A neon.query.Filter object
             */
            var createFilterClauseForTags = function(databaseAndTableName, tagFieldName) {
                var filterClauses = $scope.filterTags.map(function(tag) {
                    return neon.query.where(tagFieldName, "=", tag.name);
                });
                if(filterClauses.length === 1) {
                    return filterClauses[0];
                }
                if($scope.options.andTags) {
                    return neon.query.and.apply(neon.query, filterClauses);
                }
                return neon.query.or.apply(neon.query, filterClauses);
            };

            /**
             * Applies the specified filter and updates the visualization on success
             * @method applyFilter
             * @private
             */
            var applyFilter = function() {
                var relations = datasetService.getRelations($scope.options.database.name, $scope.options.table.name, [$scope.options.tagField.columnName]);
                filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createFilterClauseForTags, {
                    visName: "Tag Cloud",
                    text: (_.pluck($scope.filterTags, ($scope.options.showTranslation ? 'nameTranslated' : 'name'))).join(', ')
                },function() {
                    $scope.$apply(function() {
                        queryForTags();
                        // Show the Clear Filter button.
                        $scope.showFilter = true;
                        $scope.error = "";
                    });
                }, function() {
                    // Notify the user of the error.
                    $scope.error = "Error: Failed to apply the filter.";
                });
            };

            /**
             * Removes the filter and updates.
             * @method clearTagFilters
             * @private
             */
            var clearTagFilters = function() {
                filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                    $scope.$apply(function() {
                        linksPopupService.deleteLinks($scope.visualizationId);
                        $scope.showFilter = false;
                        $scope.filterTags = [];
                        $scope.error = "";
                        queryForTags();
                    });
                }, function() {
                    // Notify the user of the error.
                    $scope.error = "Error: Failed to clear filter.";
                });
            };

            /**
             * Remove a particular tag from the filter and update.
             * @param tagName {String} the tag to remove from the filter, e.g., "#lol"
             * @method removeFilter
             */
            $scope.removeFilter = function(tagName) {
                XDATA.userALE.log({
                    activity: "remove",
                    action: "click",
                    elementId: "tag-cloud",
                    elementType: "tag",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["filter", "tag-cloud", tagName]
                });
                var index = _.findIndex($scope.filterTags, {
                    name: tagName
                });
                linksPopupService.removeLinksForKey($scope.visualizationId, linksPopupService.generateKey($scope.options.tagField, tagName));
                $scope.filterTags.splice(index, 1);
            };

            $scope.handleChangedTagField = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    queryForTags();
                }
            };

            $scope.handleChangedUnsharedFilterField = function() {
                // TODO Logging
                if(!$scope.loadingData && $scope.options.filterValue) {
                    $scope.options.filterValue = "";
                    queryForTags();
                }
            };

            $scope.handleChangedUnsharedFilterValue = function() {
                // TODO Logging
                if(!$scope.loadingData) {
                    queryForTags();
                }
            };

            $scope.handleRemovedUnsharedFilter = function() {
                // TODO Logging
                $scope.options.filterValue = "";
                if(!$scope.loadingData) {
                    queryForTags();
                }
            };

            /**
             * Updates the 'from' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'from' translation language to change to
             * @method onFromLanguageChange
             */
            $scope.onFromLanguageChange = function(language) {
                XDATA.userALE.log({
                    activity: "select",
                    action: ($scope.loadingData) ? "reset" : "click",
                    elementId: "tag-cloud-options",
                    elementType: "combobox",
                    elementSub: "target-translation-language",
                    elementGroup: "chart_group",
                    source: ($scope.loadingData) ? "system" : "user",
                    tags: ["options", "tag-cloud"]
                });
                $scope.translationLanguages.chosenFromLanguage = language;

                if($scope.options.showTranslation) {
                    translate();
                }
            };

            /**
             * Updates the 'to' language on translation and translates if 'Show Translation' is checked
             * @param {String} language The 'to' translation language to change to
             * @method onToLanguageChange
             */
            $scope.onToLanguageChange = function(language) {
                XDATA.userALE.log({
                    activity: "select",
                    action: ($scope.loadingData) ? "reset" : "click",
                    elementId: "tag-cloud-options",
                    elementType: "combobox",
                    elementSub: "target-translation-language",
                    elementGroup: "chart_group",
                    source: ($scope.loadingData) ? "system" : "user",
                    tags: ["options", "tag-cloud"]
                });
                $scope.translationLanguages.chosenToLanguage = language;

                if($scope.options.showTranslation) {
                    translate();
                }
            };

            /**
             * Translates all text back to its original form if checked is false, or to the specified 'to' language
             * if checked is true.
             * @param {Boolean} checked Whether 'Show Translation' is checked or unchecked
             * @param {String} fromLang The 'from' language to use for translation
             * @param {String} toLang The 'to' language to use for translation
             * @method updateTranslation
             */
            $scope.updateTranslation = function(checked, fromLang, toLang) {
                XDATA.userALE.log({
                    activity: "select",
                    action: ($scope.loadingData) ? "reset" : "click",
                    elementId: "tag-cloud-options",
                    elementType: "button",
                    elementSub: (checked) ? "show-translation" : "remove-translation",
                    elementGroup: "chart_group",
                    source: ($scope.loadingData) ? "system" : "user",
                    tags: ["options", "tag-cloud"]
                });

                $scope.options.showTranslation = checked;

                if(checked) {
                    $scope.translationLanguages.chosenFromLanguage = fromLang;
                    $scope.translationLanguages.chosenToLanguage = toLang;
                    translate();
                } else {
                    resetTranslation();
                }
            };

            /**
             * Translates all tags and filter tags with the from/to languages specified.
             * @method translate
             * @private
             */
            var translate = function() {
                $scope.loadingData = true;

                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var dataKeys = $scope.data.map(function(elem) {
                    return elem.key;
                });

                $scope.filterTags.forEach(function(tag) {
                    dataKeys.push(tag.name);
                });

                translationService.translate(dataKeys, $scope.translationLanguages.chosenToLanguage,
                    translateSuccessCallback, translationFailureCallback, $scope.translationLanguages.chosenFromLanguage);
            };

            /**
             * Refreshes all data and filter tags with their new translations.
             * @param {Object} response Response object containing all the translations.
             * @param {Array} response.data.data.translations List of all translations. It's assumed that
             * all translations are given in the order the original text to translate was received in.
             * @param {String} response.data.data.translations[].translatedText
             * @param {String} [response.data.data.translations[].detectedSourceLanguage] Detected language
             * code of the original version of translatedText. Only provided if the source language was auto-detected.
             * @method translateSuccessCallback
             * @private
             */
            var translateSuccessCallback = function(response) {
                $scope.loadingData = false;

                response.data.data.translations.forEach(function(elem, index) {
                    if(index < $scope.data.length) {
                        $scope.data[index].keyTranslated = elem.translatedText;
                    } else {
                        $scope.filterTags[index - $scope.data.length].nameTranslated = elem.translatedText;
                    }
                });
            };

            /**
             * Resets all tags and filter tags to its original text.
             * @method resetTranslation
             * @private
             */
            var resetTranslation = function() {
                $scope.data = $scope.data.map(function(elem) {
                    elem.keyTranslated = elem.key;
                    return elem;
                });
                $scope.filterTags = _.map($scope.filterTags, function(tag) {
                    tag.nameTranslated = tag.name;
                    return tag;
                });
                $scope.translationLanguages.chosenFromLanguage = "";
                $scope.translationLanguages.chosenToLanguage = "";
            };

            /**
             * Creates and returns an object that contains information needed to export the data in this widget.
             * @return {Object} An object containing all the information needed to export the data in this widget.
             */
            $scope.makeTagCloudExportObject = function() {
                XDATA.userALE.log({
                    activity: "perform",
                    action: "click",
                    elementId: "tag-cloud-export",
                    elementType: "button",
                    elementGroup: "chart_group",
                    source: "user",
                    tags: ["options", "tag-cloud", "export"]
                });
                var finalObject = {
                    name: "Tag_Cloud",
                    data: [{
                        database: $scope.options.database.name,
                        table: $scope.options.table.name,
                        field: $scope.options.tagField.columnName,
                        limit: $scope.options.tagLimit,
                        name: "tagCloud-" + $scope.exportID,
                        fields: [],
                        type: "arraycount"
                    }]
                };
                finalObject.data[0].fields.push({
                    query: "key",
                    pretty: "Key"
                });
                finalObject.data[0].fields.push({
                    query: "count",
                    pretty: "Count"
                });
                return finalObject;
            };

            /**
             * Generates and returns the title for this visualization.
             * @method generateTitle
             * @return {String}
             */
            $scope.generateTitle = function() {
                var title = $scope.options.filterValue ? $scope.options.filterValue + " " : "";
                if($scope.bindTitle) {
                    return title + $scope.bindTitle;
                }
                return title + $scope.options.table.prettyName + ($scope.options.tagField.prettyName ? " / " + $scope.options.tagField.prettyName : "");
            };

            /**
             * Generates and returns the links popup key for this visualization.
             * @method generateLinksPopupKey
             * @return {String}
             */
            $scope.generateLinksPopupKey = function(value) {
                return linksPopupService.generateKey($scope.options.tagField, value);
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                initialize();
                displayActiveDataset();
            });
        }
    };
}]);
