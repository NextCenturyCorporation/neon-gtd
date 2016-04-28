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
 * This visualization shows aggregated string or string list data in a text cloud.
 * @namespace neonDemo.controllers
 * @class textCloudController
 * @constructor
 */
angular.module('neonDemo.controllers').controller('textCloudController', ['$scope', '$timeout', function($scope, $timeout) {
    $scope.active.dataField = {};
    $scope.active.andFilters = true;
    $scope.active.limit = 40;
    $scope.active.textColor = "#111";
    $scope.active.data = [];
    $scope.filters = [];

    // Set this option so the superclass shows the translation options in the options menu.
    $scope.active.allowsTranslations = true;

    $scope.functions.onInit = function() {
        updateTagcloudPluginSettings();
    };

    /**
     * Updates the settings for the tagcloud plugin to use the global text color.
     * @method updateTagcloudPluginSettings
     * @private
     */
    var updateTagcloudPluginSettings = function() {
        $.fn.tagcloud.defaults = {
            size: {
                start: 130,
                end: 250,
                unit: '%'
            },
            color: {
                start: '#aaaaaa',
                end: $scope.active.textColor
            }
        };
    };

    $scope.functions.onUpdateFields = function() {
        $scope.active.dataField = $scope.functions.findFieldObject("dataField", neonMappings.TAGS);
    };

    $scope.functions.areDataFieldsValid = function() {
        return $scope.functions.isFieldValid($scope.active.dataField);
    };

    $scope.functions.createNeonQueryWhereClause = function() {
        return neon.query.where($scope.active.dataField.columnName, "!=", null);
    };

    $scope.functions.addToQuery = function(query) {
        return query.groupBy($scope.active.dataField.columnName).aggregate(neon.query.COUNT, '*', 'count').sortBy('count', neon.query.DESCENDING)
            .limit($scope.active.limit).enableAggregateArraysByElement();
    };

    $scope.functions.updateData = function(data) {
        var cloudData = data || [];

        if($scope.functions.isFilterSet() && $scope.active.andFilters) {
            cloudData = cloudData.filter(function(item) {
                var index = _.findIndex($scope.filters, {
                    value: item[$scope.active.dataField.columnName]
                });
                return index === -1;
            });
        }

        $scope.active.data = cloudData.map(function(item) {
            item.key = item[$scope.active.dataField.columnName];
            item.keyTranslated = item.key;
            return item;
        });

        if($scope.active.showTranslations) {
            $scope.functions.performTranslation();
        }

        updateTextStyle();
    };

    /**
     * Updates the style of the text in this visualization using the tagcloud plugin.
     * @method updateTextStyle
     * @private
     */
    var updateTextStyle = function() {
        $timeout(function() {
            $scope.element.find('.text').tagcloud();
        });
    };

    $scope.functions.shouldQueryAfterFilter = function() {
        return true;
    };

    $scope.functions.isFilterSet = function() {
        return $scope.filters.length;
    };

    $scope.functions.getFilterFields = function() {
        return [$scope.active.dataField];
    };

    $scope.functions.createNeonFilterClause = function(databaseAndTableName, fieldName) {
        var filterClauses = $scope.filters.map(function(filter) {
            return neon.query.where(fieldName, "=", filter.value);
        });
        if(filterClauses.length === 1) {
            return filterClauses[0];
        }
        if($scope.active.andFilters) {
            return neon.query.and.apply(neon.query, filterClauses);
        }
        return neon.query.or.apply(neon.query, filterClauses);
    };

    $scope.functions.createFilterTrayText = function() {
        return (_.pluck($scope.filters, ($scope.active.showTranslations ? "translated" : "value"))).join(", ");
    };

    $scope.functions.updateFilterValues = function(neonFilter) {
        $scope.filters = [];
        if($scope.functions.getNumberOfFilterClauses(neonFilter) === 1) {
            addFilterValue(neonFilter.filter.whereClause.rhs);
        } else {
            neonFilter.filter.whereClause.whereClauses.forEach(function(whereClause) {
                addFilterValue(whereClause.rhs);
            });
        }
    };

    var addFilterValue = function(value, translated) {
        $scope.filters.push({
            translated: translated || value,
            value: value
        });
        $scope.showLinksPopupButton = !!($scope.functions.createLinks($scope.active.dataField, value).length);
    };

    $scope.functions.removeFilterValues = function() {
        $scope.filters = [];
        $scope.functions.removeLinks($scope.active.dataField);
    };

    /**
     * Adds a filter on the given value.
     * @param {String} value
     * @param {String} translated
     * @method addFilter
     */
    $scope.addFilter = function(value, translated) {
        var index = _.findIndex($scope.filters, {
            value: value
        });

        if(index < 0) {
            addFilterValue(value, translated);
            $scope.functions.updateNeonFilter();
        }
    };

    /**
     * Removes the filter on the given value.
     * @param {String} value
     * @method removeFilter
     */
    $scope.removeFilter = function(value) {
        var index = _.findIndex($scope.filters, {
            value: value
        });

        if(index >= 0) {
            $scope.filters.splice(index, 1);
            $scope.functions.removeLinks($scope.active.dataField, value);

            XDATA.userALE.log({
                activity: "remove",
                action: "click",
                elementId: "textCloud",
                elementType: "button",
                elementSub: "textCloud",
                elementGroup: "chart_group",
                source: "user",
                tags: ["filter", "textCloud", value]
            });
        }

        if($scope.filters.length) {
            $scope.functions.updateNeonFilter();
        } else {
            $scope.functions.removeNeonFilter();
        }
    };

    $scope.handleChangeDataField = function() {
        $scope.functions.logChangeAndUpdate("dataField", $scope.active.dataField.columnName);
    };

    $scope.handleChangeAndFilters = function() {
        $scope.functions.logChangeAndUpdate("andFilters", $scope.active.andFilters, "button");
        $scope.functions.updateNeonFilter();
    };

    $scope.functions.updateTranslations = function() {
        var dataKeys = $scope.active.data.map(function(item) {
            return item.key;
        });

        if($scope.functions.isFilterSet()) {
            $scope.filters.forEach(function(filter) {
                dataKeys.push(filter.value);
            });
        }

        $scope.functions.runTranslation(dataKeys, onTranslationSuccess);
    };

    var onTranslationSuccess = function(translations) {
        translations.forEach(function(item, index) {
            if(index < $scope.active.data.length) {
                $scope.active.data[index].keyTranslated = item.translatedText;
            } else {
                $scope.filters[index - $scope.active.data.length].translated = item.translatedText;
            }
        });
    };

    $scope.functions.removeTranslations = function() {
        $scope.active.data = $scope.active.data.map(function(item) {
            item.keyTranslated = item.key;
            return item;
        });

        if($scope.functions.isFilterSet()) {
            $scope.filters = _.map($scope.filters, function(filter) {
                filter.translated = filter.value;
                return filter;
            });
        }
    };

    $scope.functions.createExportDataObject = function(exportId) {
        var finalObject = {
            name: "Text_Cloud",
            data: [{
                database: $scope.active.database.name,
                table: $scope.active.table.name,
                field: $scope.active.dataField.columnName,
                limit: $scope.active.limit,
                name: "textCloud-" + exportId,
                fields: [],
                type: "arraycount"
            }]
        };
        finalObject.data[0].fields.push({
            query: $scope.active.dataField.columnName,
            pretty: $scope.active.dataField.columnName
        });
        finalObject.data[0].fields.push({
            query: "count",
            pretty: "count"
        });
        return finalObject;
    };

    $scope.functions.addToBindings = function(bindings) {
        bindings.dataField = $scope.functions.isFieldValid($scope.active.dataField) ? $scope.active.dataField.columnName : undefined;
        return bindings;
    };

    /**
     * Generates and returns the links popup key for this visualization.
     * @method getLinksPopupKey
     * @return {String}
     */
    $scope.getLinksPopupKey = function(value) {
        return $scope.functions.getLinksPopupService().generateKey($scope.active.dataField, value);
    };

    $scope.functions.onThemeChanged = function(theme) {
        if(theme.accentColor !== $scope.active.textColor) {
            $scope.active.textColor = theme.accentColor;
            updateTagcloudPluginSettings();
            updateTextStyle();
            return true;
        }
        return false;
    };

    $scope.functions.createMenuText = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.data.length ? "No Data" : "";
    };

    $scope.functions.showMenuText = function() {
        return !$scope.functions.isFilterSet() && !$scope.active.data.length;
    };

    $scope.getFilterData = function() {
        return $scope.filters.map(function(filter) {
            return filter.value;
        });
    };

    $scope.createFilterDesc = function(value) {
        return $scope.active.dataField.columnName + " = " + value;
    };

    $scope.createFilterText = function(value) {
        if(!$scope.active.showTranslations) {
            return value;
        }

        var text = "";
        $scope.filters.forEach(function(filter) {
            if(filter.value === value) {
                text = filter.translated || filter.value;
            }
        });
        return text;
    };
}]);
