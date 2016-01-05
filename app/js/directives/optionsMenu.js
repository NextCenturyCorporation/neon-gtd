'use strict';
angular.module('neonDemo.directives')
.directive('optionsMenu', ['ConnectionService', 'ErrorNotificationService', 'ExportService', 'config', function(connectionService, errorNotificationService, exportService, config) {
    return {
        templateUrl: 'partials/directives/optionsMenu.html',
        restrict: 'EA',
        transclude: true,
        scope: {
            parentElement: '=',
            resizeMenu: '=?',
            buttonText: '=?',
            showButtonText: '=?',
            exportFunction: '=?'
        },
        link: function($scope, $element) {
            // Buffer needed above and below the chart options popover based on popover position, container padding (both set in the CSS), and UX.
            $scope.CHART_OPTIONS_BUFFER_Y = 65;

            $scope.showExport = config.showExport;
            $scope.optionsDisplayed = false;

            $scope.uniqueVisualizationOptions = 'chart-options-' + uuid();
            $element.find('.chart-options').addClass($scope.uniqueVisualizationOptions);

            var showSymbol = true;
            var chartOptionsTotalWidth = 0;

            $scope.toggleOptionsDisplay = function() {
                $scope.optionsDisplayed = !$scope.optionsDisplayed;
                var activity = ($scope.optionsDisplayed) ? 'show' : 'hide';
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: $scope.uniqueVisualizationOptions,
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["options"]
                });
            };

            $scope.getButtonText = function() {
                if($.isFunction($scope.buttonText)) {
                    return $scope.buttonText();
                }
                return $scope.buttonText;
            };

            var resizeButton = function() {
                var chartOptions = $element.find(".chart-options");
                if(!showSymbol) {
                    // Save the total width of the chart options button (not abbreviated showing the symbol) including extra padding.
                    chartOptionsTotalWidth = chartOptions.outerWidth(true) + 40;
                }

                // Use jQuery hide/show instead of angular here because angular's update is delayed in some cases which causes bad UX.
                if(!showSymbol && chartOptionsTotalWidth > $scope.parentElement.width()) {
                    showSymbol = true;
                    chartOptions.find("#text").hide();
                    chartOptions.find("#symbol").show();
                } else if(showSymbol && chartOptionsTotalWidth < $scope.parentElement.width()) {
                    showSymbol = false;
                    chartOptions.find("#text").show();
                    chartOptions.find("#symbol").hide();
                }
            };

            var resizeMenu = $scope.resizeMenu || function() {
                var chartOptions = $element.find(".chart-options");
                var height = $scope.parentElement.innerHeight() - (chartOptions.outerHeight(true) - chartOptions.height() + $scope.CHART_OPTIONS_BUFFER_Y);
                chartOptions.find(".popover-content").css("max-height", height + "px");
            };

            var resizeButtonAndMenu = function() {
                resizeButton();
                resizeMenu();
            };

            $scope.parentElement.resize(resizeButtonAndMenu);
            $element.find(".chart-options").resize(resizeButton);

            // Resize the options button and menu to reflect the initial size of the parent element.
            resizeButtonAndMenu();

            var exportSuccess = function(queryResults) {
                window.location.assign("/neon/services/exportservice/generateZip/" + queryResults.data);
            };

            var exportFail = function(response) {
                if(response.responseJSON) {
                    $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                }
            };

            $scope.requestExport = function() {
                if(!$scope.exportFunction) {
                    return;
                }
                var connection = connectionService.getActiveConnection();
                if(!connection) {
                    //This is temporary. Come up with better code for if there isn't a connection.
                    return;
                }
                var data = $scope.exportFunction();
                connection.executeExport(data, exportSuccess, exportFail, exportService.getFileFormat());
            };
        }
    };
}]);
