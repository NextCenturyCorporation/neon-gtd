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
.directive('translationOptions', [function() {
    return {
        templateUrl: 'partials/directives/translationOptions.html',
        restrict: 'EA',
        scope: {
            fromLanguageField: "=?",
            toLanguageField: "=?",
            fromLanguageOptions: "=?",
            toLanguageOptions: "=?",
            showTranslation: "=?"
        },
        link: function($scope, $element) {
            $scope.disableTranslate = true;

            if(!$scope.fromLanguageField) {
               $scope.fromLanguageField = "";
            }
            if(!$scope.toLanguageField) {
               $scope.toLanguageField = "en";
            }
            if(!$scope.fromLanguageOptions || Object.keys($scope.fromLanguageOptions).length === 0) {
               $scope.fromLanguageOptions = {};
            }
            if(!$scope.toLanguageOptions || Object.keys($scope.toLanguageOptions).length === 0) {
               $scope.toLanguageOptions = {};
            }

            $scope.$watch("toLanguageOptions", function(newVal, oldVal) {
                if(!newVal || Object.keys($scope.fromLanguageOptions).length === 0) {
                    $scope.disableTranslate = true;
                } else {
                    $scope.disableTranslate = false;
                }
            });
        }
    };
}]);
