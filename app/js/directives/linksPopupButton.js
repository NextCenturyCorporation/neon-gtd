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

angular.module('neonDemo.directives')
.directive('linksPopupButton', ['LinksPopupService', function(linksPopupService) {
    return {
        template: "<span ng-show='isEnabled()'>" + linksPopupService.ENABLED_TEMPLATE + "</span>" +
            "<span ng-show='!isEnabled()'>" + linksPopupService.DISABLED_TEMPLATE + "</span>",
        restrict: "EA",
        scope: {
            key: '@',
            source: '@',
            tooltip: '@',
            json: '@?',
            isDisabled: '@?'
        },
        link: function($scope, $element) {
            $scope.isEnabled = function() {
                return $scope.isDisabled === undefined || $scope.isDisabled === "false" || $scope.isDisabled === "0" || $scope.isDisabled === "";
            };

            var updateDataLinksJson = function() {
                // Update the custom data attribute using jQuery because it ignores angular digest cycles.
                $element.find("a").data("links-json", $scope.json);
            };

            var updateFromSourceAndKey = function() {
                $scope.json = $scope.source && $scope.key ? linksPopupService.createButtonJson($scope.source, $scope.key) : "[]";
                updateDataLinksJson();
            };

            var updateFromJson = function() {
                $scope.json = $scope.json || "[]";
                updateDataLinksJson();
            };

            $scope.$watch("key", function(key) {
                if(key) {
                    updateFromSourceAndKey();
                }
            });

            $scope.$watch("source", function(source) {
                if(source) {
                    updateFromSourceAndKey();
                }
            });

            $scope.$watch("json", function(json) {
                if(json) {
                    updateFromJson();
                }
            });
        }
    };
}]);
